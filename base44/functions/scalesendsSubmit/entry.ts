import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE_URL = "https://cloud-api.plugsaas.com";
const DEFAULT_DAILY_CAP = 20;

function getApiCredentials() {
  const apiKey = (Deno.env.get("SCALESENDS_API_KEY") || "").replace(/[^\x20-\x7E]/g, "").trim();
  const customerId = (Deno.env.get("SCALESENDS_CUSTOMER_ID") || "").replace(/[^\x20-\x7E]/g, "").trim();
  if (!apiKey || !customerId) throw new Error("SCALESENDS_API_KEY or SCALESENDS_CUSTOMER_ID not configured");
  return { apiKey, customerId };
}

function getHeaders(apiKey) {
  return {
    "Authorization": `Bearer ${apiKey}`,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };
}

async function getSetting(base44, key) {
  const settings = await base44.asServiceRole.entities.AppSettings.filter({ key });
  return settings.length > 0 ? settings[0] : null;
}

async function getSettingValue(base44, key, defaultVal) {
  const s = await getSetting(base44, key);
  return s ? s.value : defaultVal;
}

async function setSettingValue(base44, key, value) {
  const existing = await base44.asServiceRole.entities.AppSettings.filter({ key });
  if (existing.length > 0) {
    await base44.asServiceRole.entities.AppSettings.update(existing[0].id, { value: String(value) });
  } else {
    await base44.asServiceRole.entities.AppSettings.create({ key, value: String(value) });
  }
}

// ── Fetch all Scalesends orders (cached per request) ──
let _ordersCache = null;
async function fetchAllScalesendsOrders(apiKey, customerId) {
  if (_ordersCache) return _ordersCache;
  const url = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/`;
  const res = await fetch(url, { headers: getHeaders(apiKey) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`List orders failed: HTTP ${res.status} — ${text.substring(0, 200)}`);
  }
  const data = await res.json();
  _ordersCache = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
  return _ordersCache;
}

// ── Check if a tenant already has a Scalesends order ──
async function findExistingOrder(apiKey, customerId, tenant) {
  const orders = await fetchAllScalesendsOrders(apiKey, customerId);
  const adminEmail = (tenant.ms_admin_username || "").toLowerCase();
  const tenantDomain = (tenant.ms_tenant_domain || "").toLowerCase();
  const msDomain = (tenant.ms_domain || "").toLowerCase();

  for (const order of orders) {
    const orderEmail = (order.email || "").toLowerCase();
    const orderDomain = (order.domain || "").toLowerCase();
    const orderEndDomain = (order.endDomain || "").toLowerCase();

    // Match by admin email
    if (adminEmail && orderEmail && orderEmail === adminEmail) return order;
    // Match by domain
    if (tenantDomain && orderDomain && tenantDomain.includes(orderDomain)) return order;
    if (msDomain && orderDomain && orderDomain.toLowerCase().includes(msDomain.toLowerCase())) return order;
    if (tenantDomain && orderEndDomain && tenantDomain.includes(orderEndDomain)) return order;
  }
  return null;
}

function mapScalesendsStatus(order) {
  const mailboxCount = order.mailboxes?.length || 0;
  const onboard = (order.onboardStatus || "").toLowerCase();
  if (mailboxCount > 0 && (onboard === "complete" || onboard === "onboarded" || onboard === "ready")) {
    return { scalesendsStatus: "complete", overallStatus: "inboxes_ready" };
  }
  if (mailboxCount > 0) {
    return { scalesendsStatus: "processing", overallStatus: "inboxes_creating" };
  }
  return { scalesendsStatus: "processing", overallStatus: "inboxes_creating" };
}

// ── Create a Scalesends order ──
async function getRandomNames(base44, count) {
  const setting = await base44.asServiceRole.entities.AppSettings.filter({ key: "scalesends_name_pool" });
  if (!setting.length || !setting[0].value) return [];
  const allNames = JSON.parse(setting[0].value);
  if (allNames.length === 0) return [];
  // Shuffle and pick `count` random names
  const shuffled = [...allNames].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

async function createScalesendsOrder(apiKey, customerId, email, password, domain, names, inboxProvider) {
  const url = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/add/`;
  console.log(`[SCALESENDS] POST ${url} — email: ${email}, domain: ${domain}, names: ${(names || []).length}, inboxProvider: ${JSON.stringify(inboxProvider || null)}`);

  const payload = { email, password, provider: "outlook" };
  if (domain && domain.length > 0) {
    payload.domain = domain;
  }
  if (names && names.length > 0) {
    payload.names = names;
  }
  if (inboxProvider) {
    payload.inboxProvider = inboxProvider;
  }

  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(apiKey),
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  console.log(`[SCALESENDS] Response: HTTP ${res.status} — ${text.substring(0, 500)}`);

  if (!res.ok) {
    const errMsg = json?.error || json?.message || text.substring(0, 200) || `HTTP ${res.status}`;
    // If 500, likely a duplicate — try to find the existing order by email
    if (res.status === 500) {
      console.log(`[SCALESENDS] Got 500, checking for existing order by email: ${email}`);
      _ordersCache = null; // force fresh fetch (cache may have stale data from pre-check)
      const orders = await fetchAllScalesendsOrders(apiKey, customerId);
      const emailLower = email.toLowerCase().trim();
      const existing = orders.find(o => (o.email || "").toLowerCase().trim() === emailLower);
      if (existing) {
        console.log(`[SCALESENDS] Found existing order ${existing._id} for ${email} — returning as duplicate`);
        return { success: false, error: errMsg, httpStatus: res.status, duplicate: true, existingOrder: existing };
      }
    }
    return { success: false, error: errMsg, httpStatus: res.status };
  }

  const order = json?.data || json;
  return {
    success: true,
    orderId: order?._id || null,
    domain: order?.domain || null,
    onboardStatus: order?.onboardStatus || null,
    mailboxCount: order?.mailboxes?.length || 0,
  };
}

// ── Auto-assign registrar after order creation ──
async function autoAssignRegistrar(apiKey, customerId, orderId) {
  const nsUrl = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${orderId}/nameservers/`;
  console.log(`[SCALESENDS] GET ${nsUrl} — fetching available registrars`);
  const nsRes = await fetch(nsUrl, { headers: getHeaders(apiKey) });
  if (!nsRes.ok) {
    console.log(`[SCALESENDS] Nameservers fetch failed: HTTP ${nsRes.status}`);
    return { success: false, error: `Nameservers fetch failed: HTTP ${nsRes.status}` };
  }
  const nsData = await nsRes.json();
  const info = nsData.data || nsData;
  const registrars = info.availableRegistrars || [];
  if (registrars.length === 0) {
    console.log(`[SCALESENDS] No available registrars for order ${orderId}`);
    return { success: false, error: "No available registrars" };
  }
  const registrarName = registrars[0].name;
  const setUrl = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${orderId}/set-registrar/`;
  console.log(`[SCALESENDS] POST ${setUrl} — assigning registrar: ${registrarName}`);
  const setRes = await fetch(setUrl, { method: "POST", headers: getHeaders(apiKey), body: JSON.stringify({ registrarName }) });
  if (!setRes.ok) {
    const text = await setRes.text();
    console.log(`[SCALESENDS] Set-registrar failed: HTTP ${setRes.status} — ${text.substring(0, 200)}`);
    return { success: false, error: `Set-registrar failed: HTTP ${setRes.status}` };
  }
  const setData = await setRes.json();
  console.log(`[SCALESENDS] Registrar assigned: ${JSON.stringify(setData.data?.assignedRegistrar || {})}`);
  return { success: true, registrar: setData.data?.assignedRegistrar };
}

// ── List all Scalesends orders (for polling/sync) ──
async function listScalesendsOrders(apiKey, customerId) {
  const url = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/`;
  const res = await fetch(url, { headers: getHeaders(apiKey) });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`List orders failed: HTTP ${res.status} — ${text.substring(0, 200)}`);
  }
  const data = await res.json();
  return Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  _ordersCache = null; // reset per-request cache
  const body = await req.json();
  const { action } = body;

  // ── getSettings ──
  if (action === "getSettings") {
    const autoSubmit = await getSettingValue(base44, "scalesends_auto_submit", "false");
    const pauseScalesends = await getSettingValue(base44, "pause_scalesends", "false");
    const dailyCap = await getSettingValue(base44, "scalesends_daily_cap", String(DEFAULT_DAILY_CAP));

    let apiKeyConfigured = false;
    try { const c = getApiCredentials(); apiKeyConfigured = true; } catch {}

    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);
    const todaySubmissions = allTenants.filter(t =>
      t.scalesends_submitted_at && new Date(t.scalesends_submitted_at) >= todayStart
    ).length;

    return Response.json({
      autoSubmit: autoSubmit === "true",
      pauseScalesends: pauseScalesends === "true",
      dailyCap: parseInt(dailyCap, 10),
      todaySubmissions,
      apiKeyConfigured,
      baseUrlConfigured: apiKeyConfigured,
    });
  }

  // ── toggleSetting ──
  if (action === "toggleSetting") {
    const { key } = body;
    const allowedKeys = ["scalesends_auto_submit", "pause_scalesends"];
    if (!allowedKeys.includes(key)) return Response.json({ error: "Invalid setting key" }, { status: 400 });

    const current = await getSettingValue(base44, key, "false");
    const newVal = current === "true" ? "false" : "true";
    await setSettingValue(base44, key, newVal);

    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: key === "scalesends_auto_submit" ? "processing_resumed" : "processing_paused",
      performed_by: user.email,
      detail: `${key} toggled to ${newVal} by admin`,
    });

    return Response.json({ key, value: newVal === "true" });
  }

  // ── getQueue ──
  if (action === "getQueue") {
    const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);

    const readyQueue = allTenants.filter(t =>
      t.overall_status === "tenant_provisioned" && !t.scalesends_status
    );
    const processing = allTenants.filter(t => t.scalesends_status === "processing" || t.scalesends_status === "pending");
    const complete = allTenants.filter(t => t.scalesends_status === "complete");
    const failed = allTenants.filter(t => t.scalesends_status === "failed");
    const manual = allTenants.filter(t => t.scalesends_status === "manual_upload");

    return Response.json({ readyQueue, processing, complete, failed, manual });
  }

  // ── submit: submit a single tenant to Scalesends ──
  if (action === "submit") {
    const { tenantId, triggerType, workspaceId, inboxProviderId } = body;
    if (!tenantId) return Response.json({ error: "tenantId required" }, { status: 400 });

    const paused = await getSettingValue(base44, "pause_scalesends", "false");
    if (paused === "true") {
      return Response.json({ error: "Scalesends submissions are paused (kill switch active)." });
    }

    const dailyCap = parseInt(await getSettingValue(base44, "scalesends_daily_cap", String(DEFAULT_DAILY_CAP)), 10);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);
    const todaySubmissions = allTenants.filter(t =>
      t.scalesends_submitted_at && new Date(t.scalesends_submitted_at) >= todayStart
    ).length;
    if (todaySubmissions >= dailyCap) {
      return Response.json({ error: `Daily cap reached (${todaySubmissions}/${dailyCap}).` });
    }

    const tenants = await base44.asServiceRole.entities.TenantLifecycle.filter({ id: tenantId });
    if (tenants.length === 0) return Response.json({ error: "Tenant not found" }, { status: 404 });
    const tenant = tenants[0];

    if (tenant.scalesends_job_id && (tenant.scalesends_status === "processing" || tenant.scalesends_status === "complete")) {
      return Response.json({ error: `Tenant already has an active Scalesends job (${tenant.scalesends_status}). Use Force Retry to override.` });
    }

    // Validate required credentials
    if (!tenant.ms_admin_username) {
      return Response.json({ error: "Missing admin username — cannot submit to Scalesends." });
    }
    if (!tenant.ms_admin_password_encrypted) {
      return Response.json({ error: "Missing admin password — cannot submit to Scalesends." });
    }

    const { apiKey, customerId } = getApiCredentials();

    // Resolve workspace name early (needed for both pre-check and create paths)
    let workspaceName = null;
    if (workspaceId) {
      const wsList = await base44.asServiceRole.entities.InstantlyWorkspace.filter({ id: workspaceId });
      if (wsList.length > 0) workspaceName = wsList[0].name;
    }

    // Resolve inbox provider
    let inboxProvider = null;
    if (inboxProviderId) {
      const provList = await base44.asServiceRole.entities.InboxProvider.filter({ id: inboxProviderId });
      if (provList.length > 0) {
        inboxProvider = { name: provList[0].provider_name, provider: provList[0].provider_type };
      }
    }

    // ── Pre-submission check: look for existing Scalesends order ──
    const existingOrder = await findExistingOrder(apiKey, customerId, tenant);
    if (existingOrder) {
      const { scalesendsStatus, overallStatus } = mapScalesendsStatus(existingOrder);
      const inboxDetails = (existingOrder.mailboxes || []).map(m => ({ name: m.name, email: m.email, password: m.password }));
      const updateData = {
        scalesends_status: scalesendsStatus,
        scalesends_job_id: existingOrder._id,
        overall_status: overallStatus,
        scalesends_inbox_count: existingOrder.mailboxes?.length || 0,
      };
      if (scalesendsStatus === "complete") {
        updateData.scalesends_completed_at = existingOrder.updatedAt || new Date().toISOString();
        updateData.scalesends_inbox_details = JSON.stringify(inboxDetails);
      }
      if (workspaceId) {
        updateData.instantly_workspace_id = workspaceId;
        updateData.instantly_workspace_name = workspaceName;
        updateData.instantly_upload_status = "pending";
      }
      await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, updateData);

      await base44.asServiceRole.entities.TenantAuditLog.create({
        action: "email_linked",
        tenant_lifecycle_id: tenant.id,
        performed_by: user.email,
        detail: `Found existing Scalesends order (ID: ${existingOrder._id}, status: ${scalesendsStatus}, email: ${existingOrder.email}). Linked to existing order instead of creating new.`,
      });

      return Response.json({
        success: true,
        linked: true,
        tenantId: tenant.id,
        tenantDomain: tenant.ms_tenant_domain,
        orderId: existingOrder._id,
        scalesendsStatus,
        overallStatus,
        mailboxCount: existingOrder.mailboxes?.length || 0,
        message: `This tenant already has a Scalesends order (ID: ${existingOrder._id}, status: ${scalesendsStatus}). Linked to existing order instead of creating new.`,
      });
    }

    const names = await getRandomNames(base44, 100);
    const sendingDomain = tenant.sending_domain || (tenant.pax8_company_name ? tenant.pax8_company_name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".info" : "");
    const result = await createScalesendsOrder(apiKey, customerId, tenant.ms_admin_username, tenant.ms_admin_password_encrypted, sendingDomain, names, inboxProvider);

    // Handle duplicate detection (API returned 500 but we found existing order)
    if (result.duplicate && result.existingOrder) {
      const dupOrder = result.existingOrder;
      const { scalesendsStatus, overallStatus } = mapScalesendsStatus(dupOrder);
      const inboxDetails = (dupOrder.mailboxes || []).map(m => ({ name: m.name, email: m.email, password: m.password }));
      const updateData = {
        scalesends_status: scalesendsStatus, scalesends_job_id: dupOrder._id,
        overall_status: overallStatus, scalesends_inbox_count: dupOrder.mailboxes?.length || 0,
      };
      if (scalesendsStatus === "complete") {
        updateData.scalesends_completed_at = dupOrder.updatedAt || new Date().toISOString();
        updateData.scalesends_inbox_details = JSON.stringify(inboxDetails);
      }
      if (workspaceId) { updateData.instantly_workspace_id = workspaceId; updateData.instantly_workspace_name = workspaceName; updateData.instantly_upload_status = "pending"; }
      await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, updateData);
      await base44.asServiceRole.entities.TenantAuditLog.create({
        action: "email_linked", tenant_lifecycle_id: tenant.id, performed_by: user.email,
        detail: `API returned 500 (duplicate). Found existing Scalesends order (ID: ${dupOrder._id}, status: ${scalesendsStatus}). Auto-linked.`,
      });
      return Response.json({
        success: true, linked: true, tenantId: tenant.id, tenantDomain: tenant.ms_tenant_domain,
        orderId: dupOrder._id, scalesendsStatus, overallStatus, mailboxCount: dupOrder.mailboxes?.length || 0,
        message: `Order already existed in Scalesends (ID: ${dupOrder._id}). Auto-linked.`,
      });
    }

    if (result.success) {
      // Auto-assign registrar
      let registrarResult = null;
      if (result.orderId) {
        registrarResult = await autoAssignRegistrar(apiKey, customerId, result.orderId);
      }

      const updateData = {
        scalesends_status: "processing",
        scalesends_job_id: result.orderId,
        scalesends_submitted_at: new Date().toISOString(),
        scalesends_trigger_type: triggerType || "manual",
        scalesends_inbox_count: result.mailboxCount || null,
        overall_status: "inboxes_creating",
      };
      if (workspaceId) {
        updateData.instantly_workspace_id = workspaceId;
        updateData.instantly_workspace_name = workspaceName;
        updateData.instantly_upload_status = "pending";
      }
      await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, updateData);

      const registrarInfo = registrarResult?.success ? `. Registrar: ${registrarResult.registrar?.name}` : "";
      await base44.asServiceRole.entities.TenantAuditLog.create({
        action: "email_parsed",
        tenant_lifecycle_id: tenant.id,
        performed_by: user.email,
        detail: `Submitted to Scalesends (${triggerType || "manual"}). Order ID: ${result.orderId}. Domain: ${result.domain || "pending"}${workspaceName ? `. Workspace: ${workspaceName}` : ""}${registrarInfo}`,
      });

      return Response.json({
        success: true,
        tenantId: tenant.id,
        tenantDomain: tenant.ms_tenant_domain,
        orderId: result.orderId,
        scalesendsDomain: result.domain,
        onboardStatus: result.onboardStatus,
        mailboxCount: result.mailboxCount,
        workspace: workspaceName,
        registrar: registrarResult?.registrar || null,
      });
    } else {
      await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
        scalesends_status: "failed",
        scalesends_failure_reason: result.error,
        scalesends_submitted_at: new Date().toISOString(),
        scalesends_trigger_type: triggerType || "manual",
        scalesends_retry_count: (tenant.scalesends_retry_count || 0) + 1,
        overall_status: "scalesends_failed",
      });

      await base44.asServiceRole.entities.TenantAuditLog.create({
        action: "email_parsed",
        tenant_lifecycle_id: tenant.id,
        performed_by: user.email,
        detail: `Scalesends submission failed (${triggerType || "manual"}): ${result.error}`,
      });

      return Response.json({
        success: false,
        error: result.error,
        tenantId: tenant.id,
        tenantDomain: tenant.ms_tenant_domain,
      });
    }
  }

  // ── bulkSubmit: submit multiple tenants with delay between calls ──
  if (action === "bulkSubmit") {
    const { tenantIds, workspaceId: bulkWorkspaceId, inboxProviderId: bulkInboxProviderId } = body;
    if (!tenantIds || !Array.isArray(tenantIds)) return Response.json({ error: "tenantIds array required" }, { status: 400 });

    const paused = await getSettingValue(base44, "pause_scalesends", "false");
    if (paused === "true") {
      return Response.json({ error: "Scalesends submissions are paused (kill switch active)." });
    }

    const { apiKey, customerId } = getApiCredentials();
    let bulkWorkspaceName = null;
    if (bulkWorkspaceId) {
      const wsList = await base44.asServiceRole.entities.InstantlyWorkspace.filter({ id: bulkWorkspaceId });
      if (wsList.length > 0) bulkWorkspaceName = wsList[0].name;
    }
    // Resolve inbox provider for bulk
    let bulkInboxProvider = null;
    if (bulkInboxProviderId) {
      const provList = await base44.asServiceRole.entities.InboxProvider.filter({ id: bulkInboxProviderId });
      if (provList.length > 0) {
        bulkInboxProvider = { name: provList[0].provider_name, provider: provList[0].provider_type };
      }
    }
    const results = [];

    for (let i = 0; i < tenantIds.length; i++) {
      const tenantId = tenantIds[i];
      const tenants = await base44.asServiceRole.entities.TenantLifecycle.filter({ id: tenantId });
      if (tenants.length === 0) {
        results.push({ tenantId, status: "not_found" });
        continue;
      }
      const tenant = tenants[0];

      if (tenant.scalesends_job_id && (tenant.scalesends_status === "processing" || tenant.scalesends_status === "complete")) {
        results.push({ tenantId, tenantDomain: tenant.ms_tenant_domain, status: "skipped", reason: "Already has active job" });
        continue;
      }

      if (!tenant.ms_admin_username || !tenant.ms_admin_password_encrypted) {
        results.push({ tenantId, tenantDomain: tenant.ms_tenant_domain, status: "skipped", reason: "Missing credentials" });
        continue;
      }

      // ── Pre-submission check for bulk ──
      const existingBulk = await findExistingOrder(apiKey, customerId, tenant);
      if (existingBulk) {
        const { scalesendsStatus: eStat, overallStatus: eOverall } = mapScalesendsStatus(existingBulk);
        const eInboxDetails = (existingBulk.mailboxes || []).map(m => ({ name: m.name, email: m.email, password: m.password }));
        const eUpdate = {
          scalesends_status: eStat, scalesends_job_id: existingBulk._id,
          overall_status: eOverall, scalesends_inbox_count: existingBulk.mailboxes?.length || 0,
        };
        if (eStat === "complete") { eUpdate.scalesends_completed_at = existingBulk.updatedAt || new Date().toISOString(); eUpdate.scalesends_inbox_details = JSON.stringify(eInboxDetails); }
        if (bulkWorkspaceId) { eUpdate.instantly_workspace_id = bulkWorkspaceId; eUpdate.instantly_workspace_name = bulkWorkspaceName; eUpdate.instantly_upload_status = "pending"; }
        await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, eUpdate);
        await base44.asServiceRole.entities.TenantAuditLog.create({ action: "email_linked", tenant_lifecycle_id: tenant.id, performed_by: user.email, detail: `Bulk: Found existing Scalesends order (ID: ${existingBulk._id}, status: ${eStat}). Linked instead of creating new.` });
        results.push({ tenantId, tenantDomain: tenant.ms_tenant_domain, status: "linked", orderId: existingBulk._id, scalesendsStatus: eStat, mailboxCount: existingBulk.mailboxes?.length || 0 });
        continue;
      }

      const bulkNames = await getRandomNames(base44, 100);
      const bulkSendingDomain = tenant.sending_domain || (tenant.pax8_company_name ? tenant.pax8_company_name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".info" : "");
      const result = await createScalesendsOrder(apiKey, customerId, tenant.ms_admin_username, tenant.ms_admin_password_encrypted, bulkSendingDomain, bulkNames, bulkInboxProvider);

      // Handle duplicate in bulk
      if (result.duplicate && result.existingOrder) {
        const dup = result.existingOrder;
        const { scalesendsStatus: dStat, overallStatus: dOverall } = mapScalesendsStatus(dup);
        const dInbox = (dup.mailboxes || []).map(m => ({ name: m.name, email: m.email, password: m.password }));
        const dUpdate = { scalesends_status: dStat, scalesends_job_id: dup._id, overall_status: dOverall, scalesends_inbox_count: dup.mailboxes?.length || 0 };
        if (dStat === "complete") { dUpdate.scalesends_completed_at = dup.updatedAt || new Date().toISOString(); dUpdate.scalesends_inbox_details = JSON.stringify(dInbox); }
        if (bulkWorkspaceId) { dUpdate.instantly_workspace_id = bulkWorkspaceId; dUpdate.instantly_workspace_name = bulkWorkspaceName; dUpdate.instantly_upload_status = "pending"; }
        await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, dUpdate);
        await base44.asServiceRole.entities.TenantAuditLog.create({ action: "email_linked", tenant_lifecycle_id: tenant.id, performed_by: user.email, detail: `Bulk: API returned 500 (duplicate). Auto-linked to order ${dup._id}.` });
        results.push({ tenantId, tenantDomain: tenant.ms_tenant_domain, status: "linked", orderId: dup._id, scalesendsStatus: dStat, mailboxCount: dup.mailboxes?.length || 0 });
        continue;
      }

      if (result.success) {
        // Auto-assign registrar
        if (result.orderId) {
          await autoAssignRegistrar(apiKey, customerId, result.orderId);
        }

        const bulkUpdate = {
          scalesends_status: "processing",
          scalesends_job_id: result.orderId,
          scalesends_submitted_at: new Date().toISOString(),
          scalesends_trigger_type: "manual",
          scalesends_inbox_count: result.mailboxCount || null,
          overall_status: "inboxes_creating",
        };
        if (bulkWorkspaceId) {
          bulkUpdate.instantly_workspace_id = bulkWorkspaceId;
          bulkUpdate.instantly_workspace_name = bulkWorkspaceName;
          bulkUpdate.instantly_upload_status = "pending";
        }
        await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, bulkUpdate);
        results.push({ tenantId, tenantDomain: tenant.ms_tenant_domain, status: "submitted", orderId: result.orderId });
      } else {
        await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
          scalesends_status: "failed",
          scalesends_failure_reason: result.error,
          scalesends_submitted_at: new Date().toISOString(),
          scalesends_trigger_type: "manual",
          scalesends_retry_count: (tenant.scalesends_retry_count || 0) + 1,
          overall_status: "scalesends_failed",
        });
        results.push({ tenantId, tenantDomain: tenant.ms_tenant_domain, status: "failed", error: result.error });
      }

      // 5-second delay between submissions
      if (i < tenantIds.length - 1) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    return Response.json({ results });
  }

  // ── syncOrders: poll Scalesends for updated order statuses ──
  if (action === "syncOrders") {
    const { apiKey, customerId } = getApiCredentials();
    const orders = await listScalesendsOrders(apiKey, customerId);
    const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);

    // Build lookup: scalesends_job_id → tenant record
    const tenantByJobId = {};
    for (const t of allTenants) {
      if (t.scalesends_job_id) tenantByJobId[t.scalesends_job_id] = t;
    }

    const synced = [];
    const registrarsAssigned = [];

    for (const order of orders) {
      const tenant = tenantByJobId[order._id];
      if (!tenant) continue;
      if (tenant.scalesends_status === "complete" || tenant.scalesends_status === "manual_upload") continue;

      const mailboxCount = order.mailboxes?.length || 0;
      const hasMailboxes = mailboxCount > 0;
      const onboardStatus = order.onboardStatus || "";

      // Determine new status
      let newStatus = tenant.scalesends_status;
      let newOverall = tenant.overall_status;

      if (hasMailboxes && (onboardStatus === "complete" || onboardStatus === "onboarded" || onboardStatus === "ready")) {
        newStatus = "complete";
        newOverall = "inboxes_ready";
      } else if (hasMailboxes) {
        // Has mailboxes but status not final yet — still processing
        newStatus = "processing";
        newOverall = "inboxes_creating";
      }

      if (newStatus !== tenant.scalesends_status || mailboxCount !== tenant.scalesends_inbox_count) {
        const updateData = {
          scalesends_status: newStatus,
          scalesends_inbox_count: mailboxCount,
          overall_status: newOverall,
        };
        if (newStatus === "complete") {
          updateData.scalesends_completed_at = new Date().toISOString();
          // Store inbox details (email + password pairs) as JSON
          const inboxDetails = (order.mailboxes || []).map(m => ({
            name: m.name, email: m.email, password: m.password,
          }));
          updateData.scalesends_inbox_details = JSON.stringify(inboxDetails);
        }

        await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, updateData);
        synced.push({
          tenantId: tenant.id,
          tenantDomain: tenant.ms_tenant_domain,
          orderId: order._id,
          oldStatus: tenant.scalesends_status,
          newStatus,
          mailboxCount,
          onboardStatus,
        });
      }
    }

    // ── Auto-assign registrars to orders that don't have one yet ──
    for (const order of orders) {
      // Skip orders that already have processing handled above
      const nsUrl = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${order._id}/nameservers/`;
      let nsData = null;
      try {
        const nsRes = await fetch(nsUrl, { headers: getHeaders(apiKey) });
        if (nsRes.ok) nsData = (await nsRes.json()).data || {};
      } catch (e) { continue; }

      // Only assign if: nameservers exist, no registrar assigned, and registrars available
      if (nsData && nsData.nameserversStatus !== "initial" && !nsData.assignedRegistrar && nsData.availableRegistrars?.length > 0) {
        const regResult = await autoAssignRegistrar(apiKey, customerId, order._id);
        if (regResult.success) {
          registrarsAssigned.push({
            orderId: order._id,
            email: order.email,
            domain: order.domain,
            registrar: regResult.registrar?.name,
          });
          console.log(`[SYNC] Auto-assigned registrar ${regResult.registrar?.name} to order ${order._id} (${order.domain})`);
        }
      }
    }

    return Response.json({ totalOrders: orders.length, synced, syncedCount: synced.length, registrarsAssigned, registrarsAssignedCount: registrarsAssigned.length });
  }

  // ── markManual ──
  if (action === "markManual") {
    const { tenantId, notes } = body;
    if (!tenantId) return Response.json({ error: "tenantId required" }, { status: 400 });

    const tenants = await base44.asServiceRole.entities.TenantLifecycle.filter({ id: tenantId });
    if (tenants.length === 0) return Response.json({ error: "Tenant not found" }, { status: 404 });

    await base44.asServiceRole.entities.TenantLifecycle.update(tenantId, {
      scalesends_status: "manual_upload",
      scalesends_marked_manual_by: user.email,
      scalesends_marked_manual_at: new Date().toISOString(),
      scalesends_manual_notes: notes || "",
      overall_status: "manually_handled",
    });

    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: "email_parsed",
      tenant_lifecycle_id: tenantId,
      performed_by: user.email,
      detail: `Marked as manually uploaded to Scalesends${notes ? `. Notes: ${notes}` : ""}`,
    });

    return Response.json({ success: true, tenantId });
  }

  // ── bulkMarkManual ──
  if (action === "bulkMarkManual") {
    const { tenantIds, notes } = body;
    if (!tenantIds || !Array.isArray(tenantIds)) return Response.json({ error: "tenantIds array required" }, { status: 400 });

    const results = [];
    for (const tenantId of tenantIds) {
      await base44.asServiceRole.entities.TenantLifecycle.update(tenantId, {
        scalesends_status: "manual_upload",
        scalesends_marked_manual_by: user.email,
        scalesends_marked_manual_at: new Date().toISOString(),
        scalesends_manual_notes: notes || "",
        overall_status: "manually_handled",
      });

      await base44.asServiceRole.entities.TenantAuditLog.create({
        action: "email_parsed",
        tenant_lifecycle_id: tenantId,
        performed_by: user.email,
        detail: `Bulk marked as manually uploaded${notes ? `. Notes: ${notes}` : ""}`,
      });

      results.push({ tenantId, status: "marked_manual" });
    }

    return Response.json({ results });
  }

  // ── copyCredentials ──
  if (action === "copyCredentials") {
    const { tenantId } = body;
    if (!tenantId) return Response.json({ error: "tenantId required" }, { status: 400 });

    const tenants = await base44.asServiceRole.entities.TenantLifecycle.filter({ id: tenantId });
    if (tenants.length === 0) return Response.json({ error: "Tenant not found" }, { status: 404 });
    const t = tenants[0];

    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: "password_revealed",
      tenant_lifecycle_id: tenantId,
      performed_by: user.email,
      detail: `Credentials copied for Scalesends manual upload (${t.ms_tenant_domain || tenantId})`,
    });

    const formatted = [
      `Tenant Domain: ${t.ms_tenant_domain || "N/A"}`,
      `Tenant ID: ${t.ms_tenant_id || "N/A"}`,
      `Admin Username: ${t.ms_admin_username || "N/A"}`,
      `Admin Password: ${t.ms_admin_password_encrypted || "N/A"}`,
      `Company: ${t.pax8_company_name || "N/A"}`,
    ].join("\n");

    return Response.json({ formatted, tenant: {
      domain: t.ms_tenant_domain,
      tenantId: t.ms_tenant_id,
      username: t.ms_admin_username,
      password: t.ms_admin_password_encrypted,
      company: t.pax8_company_name,
    }});
  }

  // ── reconcile: one-time reconciliation of all Scalesends orders against Base44 tenants ──
  if (action === "reconcile") {
    const { apiKey, customerId } = getApiCredentials();
    _ordersCache = null; // force fresh fetch
    const orders = await fetchAllScalesendsOrders(apiKey, customerId);
    const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);

    const matched = [];
    const orphaned = [];
    const alreadyLinked = [];

    for (const order of orders) {
      const orderEmail = (order.email || "").toLowerCase();
      const orderDomain = (order.domain || "").toLowerCase();
      const orderEndDomain = (order.endDomain || "").toLowerCase();

      // Try to find a matching tenant
      let matchedTenant = null;
      for (const t of allTenants) {
        // Already linked to this order
        if (t.scalesends_job_id === order._id) { matchedTenant = t; break; }
        const tEmail = (t.ms_admin_username || "").toLowerCase();
        const tDomain = (t.ms_tenant_domain || "").toLowerCase();
        const tMs = (t.ms_domain || "").toLowerCase();
        if (orderEmail && tEmail && orderEmail === tEmail) { matchedTenant = t; break; }
        if (orderDomain && tDomain && tDomain.includes(orderDomain)) { matchedTenant = t; break; }
        if (orderDomain && tMs && orderDomain.includes(tMs.toLowerCase())) { matchedTenant = t; break; }
        if (orderEndDomain && tDomain && tDomain.includes(orderEndDomain)) { matchedTenant = t; break; }
      }

      if (!matchedTenant) {
        orphaned.push({ orderId: order._id, email: order.email, domain: order.domain, endDomain: order.endDomain, onboardStatus: order.onboardStatus, mailboxCount: order.mailboxes?.length || 0 });
        continue;
      }

      // Already linked — just note it
      if (matchedTenant.scalesends_job_id === order._id) {
        alreadyLinked.push({ orderId: order._id, tenantId: matchedTenant.id, tenantDomain: matchedTenant.ms_tenant_domain });
        continue;
      }

      // Link it
      const { scalesendsStatus, overallStatus } = mapScalesendsStatus(order);
      const inboxDetails = (order.mailboxes || []).map(m => ({ name: m.name, email: m.email, password: m.password }));
      const updateData = {
        scalesends_status: scalesendsStatus,
        scalesends_job_id: order._id,
        overall_status: overallStatus,
        scalesends_inbox_count: order.mailboxes?.length || 0,
      };
      if (scalesendsStatus === "complete") {
        updateData.scalesends_completed_at = order.updatedAt || new Date().toISOString();
        updateData.scalesends_inbox_details = JSON.stringify(inboxDetails);
      }
      await base44.asServiceRole.entities.TenantLifecycle.update(matchedTenant.id, updateData);

      await base44.asServiceRole.entities.TenantAuditLog.create({
        action: "email_linked",
        tenant_lifecycle_id: matchedTenant.id,
        performed_by: user.email,
        detail: `Reconciliation: Linked existing Scalesends order (ID: ${order._id}, status: ${scalesendsStatus}, email: ${order.email}) to tenant ${matchedTenant.ms_tenant_domain || matchedTenant.id}.`,
      });

      matched.push({ orderId: order._id, tenantId: matchedTenant.id, tenantDomain: matchedTenant.ms_tenant_domain, scalesendsStatus, mailboxCount: order.mailboxes?.length || 0 });
    }

    return Response.json({
      totalScalesendsOrders: orders.length,
      newlyMatched: matched.length,
      alreadyLinked: alreadyLinked.length,
      orphanedInScalesends: orphaned.length,
      matched,
      alreadyLinked,
      orphaned,
    });
  }

  // ── getNamePool: return stored names ──
  if (action === "getNamePool") {
    const setting = await getSetting(base44, "scalesends_name_pool");
    const names = setting ? JSON.parse(setting.value) : [];
    return Response.json({ names, count: names.length });
  }

  // ── uploadNamePool: replace the name pool from CSV data ──
  if (action === "uploadNamePool") {
    const { names } = body;
    if (!names || !Array.isArray(names)) return Response.json({ error: "names array required" }, { status: 400 });
    // Each name should be { first_name, last_name }
    const cleaned = names.filter(n => n.first_name && n.last_name).map(n => ({
      first_name: n.first_name.trim(),
      last_name: n.last_name.trim(),
    }));
    await setSettingValue(base44, "scalesends_name_pool", JSON.stringify(cleaned));
    return Response.json({ success: true, count: cleaned.length });
  }

  // ── clearNamePool ──
  if (action === "clearNamePool") {
    await setSettingValue(base44, "scalesends_name_pool", "[]");
    return Response.json({ success: true });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
});
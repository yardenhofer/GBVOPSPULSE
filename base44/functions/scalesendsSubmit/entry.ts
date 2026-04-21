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

// ── Create a Scalesends order ──
async function createScalesendsOrder(apiKey, customerId, email, password) {
  const url = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/`;
  console.log(`[SCALESENDS] POST ${url} — email: ${email}`);

  const res = await fetch(url, {
    method: "POST",
    headers: getHeaders(apiKey),
    body: JSON.stringify({ email, password }),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  console.log(`[SCALESENDS] Response: HTTP ${res.status} — ${text.substring(0, 500)}`);

  if (!res.ok) {
    const errMsg = json?.error || json?.message || text.substring(0, 200) || `HTTP ${res.status}`;
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
    const { tenantId, triggerType, workspaceId } = body;
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
    const result = await createScalesendsOrder(apiKey, customerId, tenant.ms_admin_username, tenant.ms_admin_password_encrypted);

    // Resolve workspace name if workspace selected
    let workspaceName = null;
    if (workspaceId) {
      const wsList = await base44.asServiceRole.entities.InstantlyWorkspace.filter({ id: workspaceId });
      if (wsList.length > 0) workspaceName = wsList[0].name;
    }

    if (result.success) {
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

      await base44.asServiceRole.entities.TenantAuditLog.create({
        action: "email_parsed",
        tenant_lifecycle_id: tenant.id,
        performed_by: user.email,
        detail: `Submitted to Scalesends (${triggerType || "manual"}). Order ID: ${result.orderId}. Domain: ${result.domain || "pending"}${workspaceName ? `. Workspace: ${workspaceName}` : ""}`,
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
    const { tenantIds, workspaceId: bulkWorkspaceId } = body;
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

      const result = await createScalesendsOrder(apiKey, customerId, tenant.ms_admin_username, tenant.ms_admin_password_encrypted);

      if (result.success) {
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

    return Response.json({ totalOrders: orders.length, synced, syncedCount: synced.length });
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

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
});
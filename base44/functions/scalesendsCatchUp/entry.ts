import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Scheduled catch-up: finds tenants stuck at tenant_provisioned with no scalesends_status
// and triggers auto-submit for them. Runs every 5 minutes as a safety net.

const BASE_URL = "https://cloud-api.plugsaas.com";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Check if auto-submit is enabled
  const autoSetting = await base44.asServiceRole.entities.AppSettings.filter({ key: "scalesends_auto_submit" });
  const autoSubmit = autoSetting.length > 0 && autoSetting[0].value === "true";
  if (!autoSubmit) {
    console.log("[CATCHUP] Auto-submit is OFF — skipping");
    return Response.json({ skipped: true, reason: "Auto-submit disabled" });
  }

  // Check kill switch
  const pauseSetting = await base44.asServiceRole.entities.AppSettings.filter({ key: "pause_scalesends" });
  const paused = pauseSetting.length > 0 && pauseSetting[0].value === "true";
  if (paused) {
    console.log("[CATCHUP] Kill switch active — skipping");
    return Response.json({ skipped: true, reason: "Kill switch active" });
  }

  // Find tenants stuck at tenant_provisioned with no scalesends_status
  const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);
  const stuck = allTenants.filter(t =>
    t.overall_status === "tenant_provisioned" &&
    !t.scalesends_status &&
    t.ms_admin_username &&
    t.ms_admin_password_encrypted
  );

  if (stuck.length === 0) {
    console.log("[CATCHUP] No stuck tenants found");
    return Response.json({ processed: 0 });
  }

  console.log(`[CATCHUP] Found ${stuck.length} stuck tenant(s): ${stuck.map(t => t.ms_tenant_domain || t.id).join(", ")}`);

  // Check daily cap
  const capSetting = await base44.asServiceRole.entities.AppSettings.filter({ key: "scalesends_daily_cap" });
  const dailyCap = capSetting.length > 0 ? parseInt(capSetting[0].value, 10) : 100;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const todaySubmissions = allTenants.filter(t =>
    t.scalesends_submitted_at && new Date(t.scalesends_submitted_at) >= todayStart
  ).length;
  if (todaySubmissions >= dailyCap) {
    console.log(`[CATCHUP] Daily cap reached (${todaySubmissions}/${dailyCap})`);
    return Response.json({ skipped: true, reason: `Daily cap reached (${todaySubmissions}/${dailyCap})` });
  }

  const apiKey = (Deno.env.get("SCALESENDS_API_KEY") || "").replace(/[^\x20-\x7E]/g, "").trim();
  const customerId = (Deno.env.get("SCALESENDS_CUSTOMER_ID") || "").replace(/[^\x20-\x7E]/g, "").trim();
  if (!apiKey || !customerId) {
    console.log("[CATCHUP] Scalesends credentials not configured");
    return Response.json({ skipped: true, reason: "Credentials not configured" });
  }

  const headers = { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json", "Content-Type": "application/json" };

  // Fetch all existing Scalesends orders once
  let existingOrders = [];
  const listRes = await fetch(`${BASE_URL}/api/v1/simple/customers/${customerId}/orders/`, { headers });
  if (listRes.ok) {
    const listData = await listRes.json();
    existingOrders = Array.isArray(listData.data) ? listData.data : (Array.isArray(listData) ? listData : []);
  }

  // Default provider and workspace — only used if the tenant already has a workspace assigned
  let defaultInboxProvider = null;
  const defaultProviders = await base44.asServiceRole.entities.InboxProvider.filter({ is_default: true });
  if (defaultProviders.length > 0) {
    defaultInboxProvider = { name: defaultProviders[0].provider_name, provider: defaultProviders[0].provider_type };
  }

  let defaultWorkspaceId = null;
  let defaultWorkspaceName = null;
  const defaultWorkspaces = await base44.asServiceRole.entities.InstantlyWorkspace.filter({ is_default: true });
  if (defaultWorkspaces.length > 0) {
    defaultWorkspaceId = defaultWorkspaces[0].id;
    defaultWorkspaceName = defaultWorkspaces[0].name;
  }

  // Get name pool
  const namePoolSetting = await base44.asServiceRole.entities.AppSettings.filter({ key: "scalesends_name_pool" });
  let namePool = [];
  if (namePoolSetting.length > 0 && namePoolSetting[0].value) {
    namePool = JSON.parse(namePoolSetting[0].value);
  }

  const results = [];
  const remaining = dailyCap - todaySubmissions;

  for (let i = 0; i < Math.min(stuck.length, remaining); i++) {
    const tenant = stuck[i];
    const adminEmail = (tenant.ms_admin_username || "").toLowerCase();
    const tenantDomain = (tenant.ms_tenant_domain || "").toLowerCase();
    const msDomain = (tenant.ms_domain || "").toLowerCase();

    // Check if already exists in Scalesends
    let existing = null;
    for (const order of existingOrders) {
      const oEmail = (order.email || "").toLowerCase();
      const oDomain = (order.domain || "").toLowerCase();
      const oEnd = (order.endDomain || "").toLowerCase();
      if (adminEmail && oEmail && oEmail === adminEmail) { existing = order; break; }
      if (tenantDomain && oDomain && tenantDomain.includes(oDomain)) { existing = order; break; }
      if (msDomain && oDomain && oDomain.includes(msDomain.toLowerCase())) { existing = order; break; }
      if (tenantDomain && oEnd && tenantDomain.includes(oEnd)) { existing = order; break; }
    }

    // Determine workspace and provider for this tenant — only use defaults if tenant already has a workspace
    const tenantWorkspaceId = tenant.instantly_workspace_id || null;
    const tenantWorkspaceName = tenant.instantly_workspace_name || null;
    const inboxProvider = tenantWorkspaceId ? defaultInboxProvider : null;

    if (existing) {
      // Link to existing order
      const mCount = existing.mailboxes?.length || 0;
      const onboard = (existing.onboardStatus || "").toLowerCase();
      const isComplete = mCount > 0 && (onboard === "complete" || onboard === "onboarded" || onboard === "ready");
      const sStatus = isComplete ? "complete" : "processing";
      const oStatus = isComplete ? "inboxes_ready" : "inboxes_creating";
      const updateData = { scalesends_status: sStatus, scalesends_job_id: existing._id, overall_status: oStatus, scalesends_inbox_count: mCount };
      if (isComplete) {
        updateData.scalesends_completed_at = existing.updatedAt || new Date().toISOString();
        updateData.scalesends_inbox_details = JSON.stringify((existing.mailboxes || []).map(m => ({ name: m.name, email: m.email, password: m.password })));
      }
      if (tenantWorkspaceId) { updateData.instantly_workspace_id = tenantWorkspaceId; updateData.instantly_workspace_name = tenantWorkspaceName; updateData.instantly_upload_status = "pending"; }
      await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, updateData);
      await base44.asServiceRole.entities.TenantAuditLog.create({
        action: "email_linked", tenant_lifecycle_id: tenant.id,
        detail: `Catch-up: Linked to existing Scalesends order ${existing._id} (status: ${sStatus})`,
      });
      results.push({ tenantId: tenant.id, domain: tenant.ms_tenant_domain, action: "linked", orderId: existing._id });
      console.log(`[CATCHUP] Linked ${tenant.ms_tenant_domain} to existing order ${existing._id}`);
      continue;
    }

    // Create new order
    const names = namePool.length > 0 ? [...namePool].sort(() => Math.random() - 0.5).slice(0, 100) : [];
    const sendingDomain = tenant.sending_domain || (tenant.pax8_company_name ? tenant.pax8_company_name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".info" : "");
    const payload = { email: tenant.ms_admin_username, password: tenant.ms_admin_password_encrypted, provider: "outlook" };
    if (sendingDomain) payload.domain = sendingDomain;
    if (names.length > 0) payload.names = names;

    const url = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/add/`;
    console.log(`[CATCHUP] Creating order for ${tenant.ms_tenant_domain} (${tenant.ms_admin_username})`);
    const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload) });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch {}

    if (res.ok) {
      const order = json?.data || json;
      let orderId = order?._id || order?.id || null;

      // Fallback lookup if no ID returned
      if (!orderId) {
        const lookupRes = await fetch(`${BASE_URL}/api/v1/simple/customers/${customerId}/orders/`, { headers });
        if (lookupRes.ok) {
          const lookupData = await lookupRes.json();
          const allOrders = Array.isArray(lookupData.data) ? lookupData.data : [];
          const found = allOrders.find(o => (o.email || "").toLowerCase() === adminEmail);
          if (found) orderId = found._id;
        }
      }

      // Assign inbox provider
      if (orderId && inboxProvider) {
        const provUrl = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${orderId}/inbox-providers/add/`;
        await fetch(provUrl, { method: "POST", headers, body: JSON.stringify({ name: inboxProvider.name, provider: inboxProvider.provider }) });
      }

      // Assign registrar
      if (orderId) {
        const nsUrl = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${orderId}/nameservers/`;
        const nsRes = await fetch(nsUrl, { headers });
        if (nsRes.ok) {
          const nsData = await nsRes.json();
          const registrars = (nsData.data || nsData).availableRegistrars || [];
          if (registrars.length > 0) {
            await fetch(`${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${orderId}/set-registrar/`, {
              method: "POST", headers, body: JSON.stringify({ registrarName: registrars[0].name }),
            });
          }
        }
      }

      const updateData = {
        scalesends_status: "processing", scalesends_job_id: orderId,
        scalesends_submitted_at: new Date().toISOString(), scalesends_trigger_type: "auto",
        overall_status: "inboxes_creating",
      };
      if (tenantWorkspaceId) { updateData.instantly_workspace_id = tenantWorkspaceId; updateData.instantly_workspace_name = tenantWorkspaceName; updateData.instantly_upload_status = "pending"; }
      await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, updateData);
      await base44.asServiceRole.entities.TenantAuditLog.create({
        action: "email_parsed", tenant_lifecycle_id: tenant.id,
        detail: `Catch-up: Auto-submitted to Scalesends. Order ID: ${orderId}`,
      });
      results.push({ tenantId: tenant.id, domain: tenant.ms_tenant_domain, action: "submitted", orderId });
      console.log(`[CATCHUP] Submitted ${tenant.ms_tenant_domain}, order ${orderId}`);
    } else {
      const errMsg = json?.error || json?.message || text.substring(0, 200) || `HTTP ${res.status}`;

      // Check if it's a duplicate (500 error)
      if (res.status === 500) {
        const retryListRes = await fetch(`${BASE_URL}/api/v1/simple/customers/${customerId}/orders/`, { headers });
        if (retryListRes.ok) {
          const retryData = await retryListRes.json();
          const retryOrders = Array.isArray(retryData.data) ? retryData.data : [];
          const dup = retryOrders.find(o => (o.email || "").toLowerCase() === adminEmail);
          if (dup) {
            const mCount = dup.mailboxes?.length || 0;
            const onboard = (dup.onboardStatus || "").toLowerCase();
            const isComplete = mCount > 0 && (onboard === "complete" || onboard === "onboarded" || onboard === "ready");
            const updateData = {
              scalesends_status: isComplete ? "complete" : "processing",
              scalesends_job_id: dup._id, overall_status: isComplete ? "inboxes_ready" : "inboxes_creating",
              scalesends_inbox_count: mCount,
            };
            if (isComplete) {
              updateData.scalesends_completed_at = dup.updatedAt || new Date().toISOString();
              updateData.scalesends_inbox_details = JSON.stringify((dup.mailboxes || []).map(m => ({ name: m.name, email: m.email, password: m.password })));
            }
            if (tenantWorkspaceId) { updateData.instantly_workspace_id = tenantWorkspaceId; updateData.instantly_workspace_name = tenantWorkspaceName; updateData.instantly_upload_status = "pending"; }
            await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, updateData);
            await base44.asServiceRole.entities.TenantAuditLog.create({
              action: "email_linked", tenant_lifecycle_id: tenant.id,
              detail: `Catch-up: API 500 (duplicate). Linked to existing order ${dup._id}`,
            });
            results.push({ tenantId: tenant.id, domain: tenant.ms_tenant_domain, action: "linked_duplicate", orderId: dup._id });
            console.log(`[CATCHUP] Duplicate detected for ${tenant.ms_tenant_domain}, linked to ${dup._id}`);
            continue;
          }
        }
      }

      await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
        scalesends_status: "failed", scalesends_failure_reason: errMsg,
        scalesends_submitted_at: new Date().toISOString(), scalesends_trigger_type: "auto",
        scalesends_retry_count: (tenant.scalesends_retry_count || 0) + 1, overall_status: "scalesends_failed",
      });
      results.push({ tenantId: tenant.id, domain: tenant.ms_tenant_domain, action: "failed", error: errMsg });
      console.log(`[CATCHUP] Failed for ${tenant.ms_tenant_domain}: ${errMsg}`);
    }

    // Delay between submissions
    if (i < Math.min(stuck.length, remaining) - 1) {
      await new Promise(r => setTimeout(r, 5000));
    }
  }

  console.log(`[CATCHUP] Done. Processed ${results.length} tenant(s).`);
  return Response.json({ processed: results.length, results });
});
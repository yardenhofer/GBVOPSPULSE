import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Scheduled catch-up: finds tenants stuck at tenant_provisioned with no scalesends_status
// and triggers auto-submit for them. Runs every 5 minutes as a safety net.
// Processes up to BATCH_LIMIT tenants per invocation to avoid timeouts.

const BASE_URL = "https://cloud-api.plugsaas.com";
const BATCH_LIMIT = 3; // max tenants per run (Scalesends API ~20-30s per create)

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

  // Skip pre-fetching existing orders to save time — duplicates are handled via API error

  // Default provider and workspace
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
  const maxToProcess = Math.min(stuck.length, remaining, BATCH_LIMIT);

  for (let i = 0; i < maxToProcess; i++) {
    const tenant = stuck[i];
    const adminEmail = (tenant.ms_admin_username || "").toLowerCase();
    const tenantDomain = (tenant.ms_tenant_domain || "").toLowerCase();
    const msDomain = (tenant.ms_domain || "").toLowerCase();

    // No pre-check — just try creating; API returns error if duplicate

    // Determine workspace and provider for this tenant
    const tenantWorkspaceId = tenant.instantly_workspace_id || defaultWorkspaceId || null;
    const tenantWorkspaceName = tenant.instantly_workspace_name || defaultWorkspaceName || null;
    
    // Resolve inbox provider: check tenant flags first, then use default
    let inboxProvider = null;
    const providerFlag = (tenant.flags || "").split(",").map(f => f.trim()).find(f => f.startsWith("provider:"));
    if (providerFlag) {
      const providerName = providerFlag.replace("provider:", "").trim();
      if (providerName) inboxProvider = { name: providerName, provider: "instantly" };
    }
    if (!inboxProvider) inboxProvider = defaultInboxProvider;

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

      // If no orderId returned, log it but continue (syncOrders will find it later)
      if (!orderId) {
        console.log(`[CATCHUP] Warning: No order ID returned for ${tenant.ms_tenant_domain}`);
      }

      // Inbox provider assignment skipped in catch-up to save time (done later via syncOrders/fixAllProviders)

      // Registrar assignment skipped in catch-up to save time (done later via syncOrders)

      // Tag assignment skipped in catch-up to save time (can be done later via sync)

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

      await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
        scalesends_status: "failed", scalesends_failure_reason: errMsg,
        scalesends_submitted_at: new Date().toISOString(), scalesends_trigger_type: "auto",
        scalesends_retry_count: (tenant.scalesends_retry_count || 0) + 1, overall_status: "scalesends_failed",
      });
      results.push({ tenantId: tenant.id, domain: tenant.ms_tenant_domain, action: "failed", error: errMsg });
      console.log(`[CATCHUP] Failed for ${tenant.ms_tenant_domain}: ${errMsg}`);
    }

    // Brief delay between submissions
    if (i < maxToProcess - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  const stillStuck = stuck.length - maxToProcess;
  console.log(`[CATCHUP] Done. Processed ${results.length} tenant(s). ${stillStuck > 0 ? `${stillStuck} still remaining.` : "All caught up."}`);
  return Response.json({ processed: results.length, totalStuck: stuck.length, remaining: stillStuck, results });
});
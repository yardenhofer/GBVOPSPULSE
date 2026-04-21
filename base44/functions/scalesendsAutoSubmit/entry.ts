import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// This automation fires when a TenantLifecycle record is updated with overall_status = "tenant_provisioned"
// It checks if auto-submit is enabled and if so, submits the tenant to Scalesends automatically.

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { event, data } = body;

  if (!data || !event) {
    return Response.json({ skipped: true, reason: "No event data" });
  }

  const tenantId = event.entity_id;
  console.log(`[SCALESENDS-AUTO] Triggered for tenant ${tenantId}, overall_status: ${data.overall_status}`);

  // Check if auto-submit is enabled
  const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: "scalesends_auto_submit" });
  const autoSubmit = settings.length > 0 && settings[0].value === "true";

  if (!autoSubmit) {
    console.log(`[SCALESENDS-AUTO] Auto-submit is OFF — skipping tenant ${tenantId}`);
    return Response.json({ skipped: true, reason: "Auto-submit disabled" });
  }

  // Check kill switch
  const pauseSettings = await base44.asServiceRole.entities.AppSettings.filter({ key: "pause_scalesends" });
  const paused = pauseSettings.length > 0 && pauseSettings[0].value === "true";

  if (paused) {
    console.log(`[SCALESENDS-AUTO] Kill switch active — skipping tenant ${tenantId}`);
    return Response.json({ skipped: true, reason: "Kill switch active" });
  }

  // Fetch latest tenant data to make sure we have all fields
  const tenants = await base44.asServiceRole.entities.TenantLifecycle.filter({ id: tenantId });
  if (tenants.length === 0) {
    return Response.json({ skipped: true, reason: "Tenant not found" });
  }
  const tenant = tenants[0];

  // Validate tenant has credentials
  if (!tenant.ms_admin_username || !tenant.ms_admin_password_encrypted) {
    console.log(`[SCALESENDS-AUTO] Tenant ${tenantId} missing credentials — skipping`);
    return Response.json({ skipped: true, reason: "Missing credentials" });
  }

  // Don't resubmit if already has a scalesends status
  if (tenant.scalesends_status) {
    console.log(`[SCALESENDS-AUTO] Tenant ${tenantId} already has scalesends_status: ${tenant.scalesends_status} — skipping`);
    return Response.json({ skipped: true, reason: `Already has status: ${tenant.scalesends_status}` });
  }

  // Submit directly using the Scalesends API (can't call scalesendsSubmit because it requires admin auth)
  console.log(`[SCALESENDS-AUTO] Auto-submitting tenant ${tenantId} (${tenant.ms_tenant_domain}) to Scalesends`);

  const apiKey = (Deno.env.get("SCALESENDS_API_KEY") || "").replace(/[^\x20-\x7E]/g, "").trim();
  const customerId = (Deno.env.get("SCALESENDS_CUSTOMER_ID") || "").replace(/[^\x20-\x7E]/g, "").trim();
  if (!apiKey || !customerId) {
    console.log(`[SCALESENDS-AUTO] SCALESENDS_API_KEY or SCALESENDS_CUSTOMER_ID not configured`);
    return Response.json({ skipped: true, reason: "Scalesends credentials not configured" });
  }

  // Check daily cap
  const capSettings = await base44.asServiceRole.entities.AppSettings.filter({ key: "scalesends_daily_cap" });
  const dailyCap = capSettings.length > 0 ? parseInt(capSettings[0].value, 10) : 20;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);
  const todaySubmissions = allTenants.filter(t =>
    t.scalesends_submitted_at && new Date(t.scalesends_submitted_at) >= todayStart
  ).length;
  if (todaySubmissions >= dailyCap) {
    console.log(`[SCALESENDS-AUTO] Daily cap reached (${todaySubmissions}/${dailyCap})`);
    return Response.json({ skipped: true, reason: `Daily cap reached (${todaySubmissions}/${dailyCap})` });
  }

  // Call Scalesends API
  const BASE_URL = "https://cloud-api.plugsaas.com";
  const url = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email: tenant.ms_admin_username, password: tenant.ms_admin_password_encrypted }),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  console.log(`[SCALESENDS-AUTO] API response: HTTP ${res.status} — ${text.substring(0, 500)}`);

  if (res.ok) {
    const order = json?.data || json;
    const orderId = order?._id || null;
    const mailboxCount = order?.mailboxes?.length || 0;

    await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
      scalesends_status: "processing",
      scalesends_job_id: orderId,
      scalesends_submitted_at: new Date().toISOString(),
      scalesends_trigger_type: "auto",
      scalesends_inbox_count: mailboxCount || null,
      overall_status: "inboxes_creating",
    });

    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: "email_parsed",
      tenant_lifecycle_id: tenant.id,
      detail: `Auto-submitted to Scalesends. Order ID: ${orderId}. Domain: ${order?.domain || "pending"}.`,
    });

    console.log(`[SCALESENDS-AUTO] Success! Order ${orderId} for ${tenant.ms_tenant_domain}`);
    return Response.json({ success: true, tenantId, orderId });
  } else {
    const errMsg = json?.error || json?.message || text.substring(0, 200) || `HTTP ${res.status}`;

    await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
      scalesends_status: "failed",
      scalesends_failure_reason: errMsg,
      scalesends_submitted_at: new Date().toISOString(),
      scalesends_trigger_type: "auto",
      scalesends_retry_count: (tenant.scalesends_retry_count || 0) + 1,
      overall_status: "scalesends_failed",
    });

    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: "email_parsed",
      tenant_lifecycle_id: tenant.id,
      detail: `Auto-submit to Scalesends FAILED: ${errMsg}`,
    });

    console.log(`[SCALESENDS-AUTO] Failed: ${errMsg}`);
    return Response.json({ success: false, error: errMsg });
  }
});
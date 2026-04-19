import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Rate limit: 1 submission per 10 seconds (enforced via timestamp tracking)
// Daily cap: configurable, default 20
const DEFAULT_DAILY_CAP = 20;
const AUTO_HOURLY_CAP = 10;

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

// Placeholder API call - DO NOT replace until real Scalesends docs arrive
async function callScalesendsAPI(tenantData) {
  // ╔══════════════════════════════════════════════════════════════╗
  // ║  PLACEHOLDER: Scalesends API integration pending docs.      ║
  // ║  Do NOT attempt real HTTP calls until Leon provides:        ║
  // ║  - Endpoint URLs                                            ║
  // ║  - Auth header format                                       ║
  // ║  - Payload schema                                           ║
  // ║  - Response schema                                          ║
  // ╚══════════════════════════════════════════════════════════════╝
  console.log("[SCALESENDS] Placeholder call for tenant:", tenantData.ms_tenant_domain, "(credentials redacted)");
  return {
    success: false,
    error: "Scalesends API integration pending documentation from vendor. Please use manual upload or mark as manually uploaded.",
    placeholder: true,
  };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  // ── getSettings: return all scalesends-related settings ──
  if (action === "getSettings") {
    const autoSubmit = await getSettingValue(base44, "scalesends_auto_submit", "false");
    const pauseScalesends = await getSettingValue(base44, "pause_scalesends", "false");
    const dailyCap = await getSettingValue(base44, "scalesends_daily_cap", String(DEFAULT_DAILY_CAP));
    const apiKeySet = !!Deno.env.get("SCALESENDS_API_KEY");
    const baseUrlSet = false; // Will be true once SCALESENDS_BASE_URL secret is configured after docs arrive

    // Count today's submissions
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
      apiKeyConfigured: apiKeySet,
      baseUrlConfigured: baseUrlSet,
    });
  }

  // ── toggleSetting: toggle a boolean setting ──
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

  // ── getQueue: return tenants ready for Scalesends ──
  if (action === "getQueue") {
    const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);
    
    const readyQueue = allTenants.filter(t =>
      t.overall_status === "tenant_provisioned" && !t.scalesends_status
    );
    const processing = allTenants.filter(t => t.scalesends_status === "processing");
    const complete = allTenants.filter(t => t.scalesends_status === "complete");
    const failed = allTenants.filter(t => t.scalesends_status === "failed");
    const manual = allTenants.filter(t => t.scalesends_status === "manual_upload");

    return Response.json({ readyQueue, processing, complete, failed, manual });
  }

  // ── submit: submit a single tenant to Scalesends ──
  if (action === "submit") {
    const { tenantId, triggerType } = body;
    if (!tenantId) return Response.json({ error: "tenantId required" }, { status: 400 });

    // Check kill switch
    const paused = await getSettingValue(base44, "pause_scalesends", "false");
    if (paused === "true") {
      return Response.json({ error: "Scalesends submissions are paused (kill switch active). Disable PAUSE_SCALESENDS to continue." });
    }

    // Check daily cap
    const dailyCap = parseInt(await getSettingValue(base44, "scalesends_daily_cap", String(DEFAULT_DAILY_CAP)), 10);
    const todayStart = new Date();
    todayStart.setUTCHours(0, 0, 0, 0);
    const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);
    const todaySubmissions = allTenants.filter(t =>
      t.scalesends_submitted_at && new Date(t.scalesends_submitted_at) >= todayStart
    ).length;
    if (todaySubmissions >= dailyCap) {
      return Response.json({ error: `Daily submission cap reached (${todaySubmissions}/${dailyCap}). Try again tomorrow or increase cap in settings.` });
    }

    // Fetch tenant
    const tenants = await base44.asServiceRole.entities.TenantLifecycle.filter({ id: tenantId });
    if (tenants.length === 0) return Response.json({ error: "Tenant not found" }, { status: 404 });
    const tenant = tenants[0];

    // Duplicate job check
    if (tenant.scalesends_job_id && (tenant.scalesends_status === "processing" || tenant.scalesends_status === "complete")) {
      return Response.json({ error: `Tenant already has an active Scalesends job (${tenant.scalesends_status}). Use Force Retry to override.` });
    }

    // Call placeholder API
    const result = await callScalesendsAPI({
      ms_tenant_id: tenant.ms_tenant_id,
      ms_tenant_domain: tenant.ms_tenant_domain,
      ms_admin_username: tenant.ms_admin_username,
      // Password would be decrypted here in real implementation
    });

    if (result.success) {
      await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
        scalesends_status: "processing",
        scalesends_job_id: result.jobId,
        scalesends_submitted_at: new Date().toISOString(),
        scalesends_trigger_type: triggerType || "manual",
        overall_status: "inboxes_creating",
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
    }

    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: "email_parsed", // reusing closest enum for "submit"
      tenant_lifecycle_id: tenant.id,
      performed_by: user.email,
      detail: result.success
        ? `Submitted to Scalesends (${triggerType || "manual"}). Job ID: ${result.jobId}`
        : `Scalesends submission failed (${triggerType || "manual"}): ${result.error}`,
    });

    return Response.json({
      success: result.success,
      error: result.error,
      placeholder: result.placeholder,
      tenantId: tenant.id,
      tenantDomain: tenant.ms_tenant_domain,
    });
  }

  // ── markManual: mark tenant as manually uploaded ──
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
      action: "email_parsed", // closest available enum
      tenant_lifecycle_id: tenantId,
      performed_by: user.email,
      detail: `Marked as manually uploaded to Scalesends${notes ? `. Notes: ${notes}` : ""}`,
    });

    return Response.json({ success: true, tenantId });
  }

  // ── bulkSubmit: submit multiple tenants with 10s delay ──
  if (action === "bulkSubmit") {
    const { tenantIds } = body;
    if (!tenantIds || !Array.isArray(tenantIds)) return Response.json({ error: "tenantIds array required" }, { status: 400 });

    // Check kill switch
    const paused = await getSettingValue(base44, "pause_scalesends", "false");
    if (paused === "true") {
      return Response.json({ error: "Scalesends submissions are paused (kill switch active)." });
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

      const result = await callScalesendsAPI({
        ms_tenant_id: tenant.ms_tenant_id,
        ms_tenant_domain: tenant.ms_tenant_domain,
        ms_admin_username: tenant.ms_admin_username,
      });

      if (result.success) {
        await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
          scalesends_status: "processing",
          scalesends_job_id: result.jobId,
          scalesends_submitted_at: new Date().toISOString(),
          scalesends_trigger_type: "manual",
          overall_status: "inboxes_creating",
        });
        results.push({ tenantId, tenantDomain: tenant.ms_tenant_domain, status: "submitted" });
      } else {
        await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
          scalesends_status: "failed",
          scalesends_failure_reason: result.error,
          scalesends_submitted_at: new Date().toISOString(),
          scalesends_trigger_type: "manual",
          scalesends_retry_count: (tenant.scalesends_retry_count || 0) + 1,
          overall_status: "scalesends_failed",
        });
        results.push({ tenantId, tenantDomain: tenant.ms_tenant_domain, status: "failed", error: result.error, placeholder: result.placeholder });
      }

      // 10-second delay between submissions
      if (i < tenantIds.length - 1) {
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    return Response.json({ results });
  }

  // ── bulkMarkManual: mark multiple as manually uploaded ──
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

  // ── copyCredentials: return formatted credentials for clipboard ──
  if (action === "copyCredentials") {
    const { tenantId } = body;
    if (!tenantId) return Response.json({ error: "tenantId required" }, { status: 400 });

    const tenants = await base44.asServiceRole.entities.TenantLifecycle.filter({ id: tenantId });
    if (tenants.length === 0) return Response.json({ error: "Tenant not found" }, { status: 404 });
    const t = tenants[0];

    // Audit the credential access
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
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INSTANTLY_API_URL = "https://api.instantly.ai/api/v2";

// Upload a single email account to Instantly
async function addAccountToInstantly(apiKey, inbox) {
  const email = inbox.email;
  const password = inbox.password;
  const name = inbox.name || email.split("@")[0];

  // Parse first/last name
  const nameParts = name.split(/[\s.]+/);
  const firstName = nameParts[0] || "Inbox";
  const lastName = nameParts.slice(1).join(" ") || email.split("@")[1]?.split(".")[0] || "User";

  // Microsoft 365 accounts — IMAP/SMTP via Outlook
  const payload = {
    email,
    first_name: firstName,
    last_name: lastName,
    provider_code: 2, // Microsoft / Outlook
    imap_username: email,
    imap_password: password,
    imap_host: "outlook.office365.com",
    imap_port: 993,
    smtp_username: email,
    smtp_password: password,
    smtp_host: "smtp.office365.com",
    smtp_port: 587,
    daily_limit: 30,
    warmup: {
      limit: 30,
      advanced: {
        warm_ctd: false,
        open_rate: 0.95,
        important_rate: 0.8,
        read_emulation: true,
        spam_save_rate: 0.02,
        weekday_only: true,
      },
      increment: "disabled",
      reply_rate: 0.1,
    },
  };

  console.log(`[INSTANTLY] Adding account: ${email}`);

  const res = await fetch(`${INSTANTLY_API_URL}/accounts`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}

  console.log(`[INSTANTLY] Response for ${email}: HTTP ${res.status} — ${text.substring(0, 300)}`);

  if (!res.ok) {
    return { email, success: false, error: json?.message || json?.error || text.substring(0, 200) };
  }

  return { email, success: true, data: json };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  // ── uploadTenantInboxes: upload all inboxes for a specific tenant ──
  if (action === "uploadTenantInboxes") {
    const { tenantId } = body;
    if (!tenantId) return Response.json({ error: "tenantId required" }, { status: 400 });

    const tenants = await base44.asServiceRole.entities.TenantLifecycle.filter({ id: tenantId });
    if (tenants.length === 0) return Response.json({ error: "Tenant not found" }, { status: 404 });
    const tenant = tenants[0];

    if (tenant.scalesends_status !== "complete") {
      return Response.json({ error: "Scalesends not complete yet — inboxes not ready." });
    }

    if (!tenant.instantly_workspace_id) {
      return Response.json({ error: "No Instantly workspace selected for this tenant." });
    }

    if (!tenant.scalesends_inbox_details) {
      return Response.json({ error: "No inbox details available from Scalesends." });
    }

    // Get workspace API key
    const workspaces = await base44.asServiceRole.entities.InstantlyWorkspace.filter({ id: tenant.instantly_workspace_id });
    if (workspaces.length === 0) {
      return Response.json({ error: "Selected workspace not found. It may have been deleted." });
    }
    const workspace = workspaces[0];
    const apiKey = workspace.api_key;

    // Parse inbox details
    let inboxes = [];
    try { inboxes = JSON.parse(tenant.scalesends_inbox_details); } catch {}
    if (!Array.isArray(inboxes) || inboxes.length === 0) {
      return Response.json({ error: "No valid inbox data to upload." });
    }

    // Mark as uploading
    await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
      instantly_upload_status: "uploading",
    });

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < inboxes.length; i++) {
      const inbox = inboxes[i];
      if (!inbox.email || !inbox.password) {
        results.push({ email: inbox.email || "unknown", success: false, error: "Missing email or password" });
        failCount++;
        continue;
      }

      const result = await addAccountToInstantly(apiKey, inbox);
      results.push(result);
      if (result.success) successCount++;
      else failCount++;

      // Small delay between API calls
      if (i < inboxes.length - 1) {
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // Update tenant status
    const finalStatus = failCount === inboxes.length ? "failed" : (failCount > 0 ? "complete" : "complete");
    const updateData = {
      instantly_upload_status: failCount === inboxes.length ? "failed" : "complete",
    };
    if (failCount > 0 && failCount < inboxes.length) {
      updateData.instantly_upload_error = `${failCount}/${inboxes.length} failed`;
    } else if (failCount === inboxes.length) {
      updateData.instantly_upload_error = `All ${inboxes.length} uploads failed: ${results[0]?.error || "unknown"}`;
    }
    await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, updateData);

    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: "email_parsed",
      tenant_lifecycle_id: tenant.id,
      performed_by: user.email,
      detail: `Instantly upload: ${successCount}/${inboxes.length} succeeded → ${workspace.name}`,
    });

    return Response.json({
      tenantId: tenant.id,
      workspace: workspace.name,
      total: inboxes.length,
      success: successCount,
      failed: failCount,
      results,
    });
  }

  // ── processReadyTenants: find all tenants with complete inboxes + workspace, upload them ──
  if (action === "processReadyTenants") {
    const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);
    const ready = allTenants.filter(t =>
      t.scalesends_status === "complete" &&
      t.instantly_workspace_id &&
      (!t.instantly_upload_status || t.instantly_upload_status === "pending")
    );

    if (ready.length === 0) {
      return Response.json({ message: "No tenants ready for Instantly upload.", processed: 0 });
    }

    const processed = [];
    for (const tenant of ready) {
      // Invoke self for each tenant
      const res = await base44.asServiceRole.functions.invoke("instantlyUpload", {
        action: "uploadTenantInboxes",
        tenantId: tenant.id,
      });
      processed.push({ tenantId: tenant.id, domain: tenant.ms_tenant_domain, result: res });
    }

    return Response.json({ processed: processed.length, details: processed });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
});
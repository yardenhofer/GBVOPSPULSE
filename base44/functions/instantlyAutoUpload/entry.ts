import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INSTANTLY_API_URL = "https://api.instantly.ai/api/v2";

async function addAccountToInstantly(apiKey, inbox) {
  const email = inbox.email;
  const password = inbox.password;
  const name = inbox.name || email.split("@")[0];
  const nameParts = name.split(/[\s.]+/);
  const firstName = nameParts[0] || "Inbox";
  const lastName = nameParts.slice(1).join(" ") || email.split("@")[1]?.split(".")[0] || "User";

  const payload = {
    email,
    first_name: firstName,
    last_name: lastName,
    provider_code: 2,
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

  console.log(`[INSTANTLY-AUTO] Adding account: ${email}`);
  const res = await fetch(`${INSTANTLY_API_URL}/accounts`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  console.log(`[INSTANTLY-AUTO] ${email}: HTTP ${res.status}`);

  if (!res.ok) {
    return { email, success: false, error: json?.message || json?.error || text.substring(0, 200) };
  }
  return { email, success: true };
}

// This is triggered by the entity automation when a TenantLifecycle record is updated
// It checks if scalesends just completed and a workspace is assigned, then auto-uploads
Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const body = await req.json();
  const { event, data } = body;

  // Only process update events
  if (!event || event.type !== "update") {
    return Response.json({ skipped: true, reason: "Not an update event" });
  }

  const tenant = data;
  if (!tenant) {
    return Response.json({ skipped: true, reason: "No tenant data" });
  }

  // Check if this tenant is ready for Instantly upload
  if (tenant.scalesends_status !== "complete") {
    return Response.json({ skipped: true, reason: "Scalesends not complete" });
  }

  if (!tenant.instantly_workspace_id) {
    return Response.json({ skipped: true, reason: "No workspace assigned" });
  }

  if (tenant.instantly_upload_status && tenant.instantly_upload_status !== "pending") {
    return Response.json({ skipped: true, reason: `Already ${tenant.instantly_upload_status}` });
  }

  if (!tenant.scalesends_inbox_details) {
    return Response.json({ skipped: true, reason: "No inbox details" });
  }

  console.log(`[INSTANTLY-AUTO] Auto-uploading inboxes for tenant ${tenant.id} (${tenant.ms_tenant_domain})`);

  // Get workspace API key
  const workspaces = await base44.asServiceRole.entities.InstantlyWorkspace.filter({ id: tenant.instantly_workspace_id });
  if (workspaces.length === 0) {
    await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
      instantly_upload_status: "failed",
      instantly_upload_error: "Workspace not found",
    });
    return Response.json({ error: "Workspace not found" });
  }

  const workspace = workspaces[0];
  const apiKey = workspace.api_key;

  let inboxes = [];
  try { inboxes = JSON.parse(tenant.scalesends_inbox_details); } catch {}
  if (!Array.isArray(inboxes) || inboxes.length === 0) {
    await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
      instantly_upload_status: "failed",
      instantly_upload_error: "No valid inbox data",
    });
    return Response.json({ error: "No valid inbox data" });
  }

  // Mark uploading
  await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
    instantly_upload_status: "uploading",
  });

  let successCount = 0;
  let failCount = 0;
  let lastError = "";

  for (let i = 0; i < inboxes.length; i++) {
    const inbox = inboxes[i];
    if (!inbox.email || !inbox.password) { failCount++; continue; }
    const result = await addAccountToInstantly(apiKey, inbox);
    if (result.success) successCount++;
    else { failCount++; lastError = result.error; }
    if (i < inboxes.length - 1) await new Promise(r => setTimeout(r, 1000));
  }

  const updateData = {
    instantly_upload_status: failCount === inboxes.length ? "failed" : "complete",
  };
  if (failCount > 0) {
    updateData.instantly_upload_error = failCount === inboxes.length
      ? `All ${inboxes.length} failed: ${lastError}`
      : `${failCount}/${inboxes.length} failed`;
  }
  await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, updateData);

  await base44.asServiceRole.entities.TenantAuditLog.create({
    action: "email_parsed",
    tenant_lifecycle_id: tenant.id,
    detail: `Auto-upload to Instantly: ${successCount}/${inboxes.length} succeeded → ${workspace.name}`,
  });

  console.log(`[INSTANTLY-AUTO] Done: ${successCount}/${inboxes.length} for ${tenant.ms_tenant_domain}`);
  return Response.json({ success: true, uploaded: successCount, failed: failCount, total: inboxes.length });
});
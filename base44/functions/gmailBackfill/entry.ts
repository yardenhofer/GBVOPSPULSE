import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Scans Gmail for recent Pax8 fulfillment emails that were missed
// Processes up to 20 unprocessed emails per run to avoid timeouts.
// Click multiple times until all are caught up.

const SENDER_PATTERNS = ["noreply@pax8.com", "sendgrid.pax8.com"];
const SUBJECT_REQUIRED = "microsoft software order fulfilled";

function matchesSenderFilter(from) {
  return SENDER_PATTERNS.some(p => (from || "").toLowerCase().includes(p));
}
function matchesSubjectFilter(subject) {
  return (subject || "").toLowerCase().includes(SUBJECT_REQUIRED);
}
function getHeader(headers, name) {
  const h = headers?.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}
function decodeBase64Url(str) {
  if (!str) return "";
  try { return atob(str.replace(/-/g, "+").replace(/_/g, "/")); } catch { return ""; }
}
function extractBody(payload) {
  if (payload.body?.data) return decodeBase64Url(payload.body.data);
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data);
    }
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) return decodeBase64Url(part.body.data);
    }
    for (const part of payload.parts) {
      if (part.parts) { const n = extractBody(part); if (n) return n; }
    }
  }
  return "";
}
function attemptParse(body) {
  const result = { parsed: false, tenantId: null, tenantDomain: null, adminUsername: null, adminPassword: null };
  const usernameMatch = body.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9-]+\.onmicrosoft\.com)/i);
  if (usernameMatch) {
    result.adminUsername = usernameMatch[1];
    const domainMatch = usernameMatch[1].match(/@(.+\.onmicrosoft\.com)/i);
    if (domainMatch) result.tenantDomain = domainMatch[1];
  }
  const tenantIdArea = body.match(/(?:tenant|directory)\s*(?:id|ID)?[:\s]*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
  if (tenantIdArea) { result.tenantId = tenantIdArea[1]; }
  else { const uuids = body.match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi); if (uuids) result.tenantId = uuids[0]; }
  const pwdMatch = body.match(/(?:initial password|temporary password|password)\s*(?:<[^>]*>)*[:\s]*(?:<[^>]*>)*\s*([^\s<\n\r]{4,40})/i);
  if (pwdMatch) {
    const pwdRaw = pwdMatch[1];
    const pwdEndIdx = pwdMatch.index + pwdMatch[0].length;
    const charAfter = body[pwdEndIdx] || "";
    result.adminPassword = (/[.,;]$/.test(pwdRaw) && charAfter === "<") ? pwdRaw.replace(/[.,;]$/, "") : pwdRaw;
  }
  result.parsed = !!(result.adminUsername || result.tenantId);
  return result;
}

const BATCH_LIMIT = 20; // max emails per invocation

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const maxResults = body.maxResults || 200;

  const { accessToken } = await base44.asServiceRole.connectors.getConnection("gmail");

  // Step 1: Search Gmail
  const query = 'from:pax8.com subject:"microsoft software order fulfilled"';
  const searchRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=${maxResults}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!searchRes.ok) {
    return Response.json({ error: `Gmail search failed: HTTP ${searchRes.status}` });
  }
  const searchData = await searchRes.json();
  const allMessages = searchData.messages || [];
  console.log(`[BACKFILL] Found ${allMessages.length} emails in Gmail`);

  // Step 2: Filter out already-logged emails
  const existingLogs = await base44.asServiceRole.entities.GmailEmailLog.list("-created_date", 500);
  const processedIds = new Set(existingLogs.map(l => l.gmail_message_id));
  const newMessageIds = allMessages.map(m => m.id).filter(id => !processedIds.has(id));
  const remaining = newMessageIds.length;
  console.log(`[BACKFILL] ${remaining} unprocessed (${allMessages.length - remaining} already logged)`);

  if (remaining === 0) {
    return Response.json({ found: allMessages.length, remaining: 0, processed: 0, done: true });
  }

  // Step 3: Process up to BATCH_LIMIT emails directly
  const batch = newMessageIds.slice(0, BATCH_LIMIT);
  const results = [];

  for (const messageId of batch) {
    // Fetch full message
    const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!msgRes.ok) {
      results.push({ messageId, status: "error", reason: `HTTP ${msgRes.status}` });
      continue;
    }

    const message = await msgRes.json();
    const headers = message.payload?.headers || [];
    const from = getHeader(headers, "From");
    const subject = getHeader(headers, "Subject");
    const dateStr = getHeader(headers, "Date");
    const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();

    const matched = matchesSenderFilter(from) && matchesSubjectFilter(subject);

    // Log every email
    const emailLog = await base44.asServiceRole.entities.GmailEmailLog.create({
      gmail_message_id: messageId, from, subject, received_at: receivedAt, matched, processed: false,
      processing_notes: matched ? "Backfill: matched" : "Backfill: not matched",
    });

    if (!matched) {
      results.push({ messageId, status: "skipped", reason: "filter mismatch" });
      continue;
    }

    const emailBody = extractBody(message.payload);
    const parsed = attemptParse(emailBody);

    if (!parsed.parsed) {
      const tenant = await base44.asServiceRole.entities.TenantLifecycle.create({
        overall_status: "awaiting_parser",
        provisioning_email_message_id: messageId,
        provisioning_email_received_at: receivedAt,
        provisioning_email_raw_body: emailBody.substring(0, 50000),
        flags: "awaiting_parser",
      });
      await base44.asServiceRole.entities.GmailEmailLog.update(emailLog.id, {
        processed: true, tenant_lifecycle_id: tenant.id,
        processing_notes: "Backfill: matched but parser failed",
      });
      results.push({ messageId, status: "awaiting_parser", tenantId: tenant.id });
      continue;
    }

    // Check duplicate tenant ID
    if (parsed.tenantId) {
      const existing = await base44.asServiceRole.entities.TenantLifecycle.filter({ ms_tenant_id: parsed.tenantId });
      if (existing.length > 0) {
        await base44.asServiceRole.entities.GmailEmailLog.update(emailLog.id, {
          processed: true, processing_notes: `Backfill: duplicate tenant ${parsed.tenantId}`,
        });
        results.push({ messageId, status: "duplicate", existingRecordId: existing[0].id });
        continue;
      }
    }

    // Try to match by domain
    let linkedRecord = null;
    let matchMethod = "none";
    if (parsed.tenantDomain) {
      const domainPrefix = parsed.tenantDomain.replace(/\.onmicrosoft\.com$/i, "");
      const byDomain = await base44.asServiceRole.entities.TenantLifecycle.filter({ ms_domain: domainPrefix });
      if (byDomain.length > 0) { linkedRecord = byDomain[0]; matchMethod = "domain"; }
    }

    if (linkedRecord) {
      await base44.asServiceRole.entities.TenantLifecycle.update(linkedRecord.id, {
        ms_tenant_id: parsed.tenantId || linkedRecord.ms_tenant_id,
        ms_tenant_domain: parsed.tenantDomain || linkedRecord.ms_tenant_domain,
        ms_admin_username: parsed.adminUsername || linkedRecord.ms_admin_username,
        ms_admin_password_encrypted: parsed.adminPassword || linkedRecord.ms_admin_password_encrypted,
        provisioning_email_message_id: messageId,
        provisioning_email_received_at: receivedAt,
        provisioning_email_raw_body: emailBody.substring(0, 50000),
        overall_status: "tenant_provisioned",
        match_method: matchMethod,
      });
      await base44.asServiceRole.entities.GmailEmailLog.update(emailLog.id, {
        processed: true, tenant_lifecycle_id: linkedRecord.id,
        processing_notes: `Backfill: linked via ${matchMethod}`,
      });
      results.push({ messageId, status: "linked", tenantId: linkedRecord.id, matchMethod });
    } else {
      const tenant = await base44.asServiceRole.entities.TenantLifecycle.create({
        ms_tenant_id: parsed.tenantId,
        ms_tenant_domain: parsed.tenantDomain,
        ms_admin_username: parsed.adminUsername,
        ms_admin_password_encrypted: parsed.adminPassword,
        provisioning_email_message_id: messageId,
        provisioning_email_received_at: receivedAt,
        provisioning_email_raw_body: emailBody.substring(0, 50000),
        overall_status: parsed.adminPassword ? "tenant_provisioned" : "tenant_provisioning",
        match_method: "none",
        flags: "unmatched",
      });
      await base44.asServiceRole.entities.GmailEmailLog.update(emailLog.id, {
        processed: true, tenant_lifecycle_id: tenant.id,
        processing_notes: "Backfill: unmatched, created new record",
      });
      results.push({ messageId, status: "unmatched", tenantId: tenant.id });
    }
  }

  const linked = results.filter(r => r.status === "linked").length;
  const unmatched = results.filter(r => r.status === "unmatched").length;
  const duplicates = results.filter(r => r.status === "duplicate").length;
  const skipped = results.filter(r => r.status === "skipped").length;
  const errors = results.filter(r => r.status === "error").length;
  const awaitingParser = results.filter(r => r.status === "awaiting_parser").length;
  const stillRemaining = remaining - batch.length;

  await base44.asServiceRole.entities.TenantAuditLog.create({
    action: "processing_resumed",
    performed_by: user.email,
    detail: `Gmail backfill: processed ${results.length}/${remaining} unprocessed emails. Linked: ${linked}, Unmatched: ${unmatched}, Duplicates: ${duplicates}, Parser: ${awaitingParser}, Errors: ${errors}. ${stillRemaining} still remaining.`,
  });

  return Response.json({
    found: allMessages.length,
    remaining: stillRemaining,
    processed: results.length,
    done: stillRemaining === 0,
    summary: { linked, unmatched, duplicates, skipped, errors, awaitingParser },
    results,
  });
});
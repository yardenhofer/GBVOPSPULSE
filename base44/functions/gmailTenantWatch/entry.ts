import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Sender patterns (match ANY)
const SENDER_PATTERNS = [
  "noreply@pax8.com",
  "sendgrid.pax8.com",
];

// Subject must contain this exact phrase
const SUBJECT_REQUIRED = "microsoft software order fulfilled";

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 20;

function matchesSenderFilter(from) {
  const lower = (from || "").toLowerCase();
  return SENDER_PATTERNS.some(p => lower.includes(p));
}

function matchesSubjectFilter(subject) {
  const lower = (subject || "").toLowerCase();
  return lower.includes(SUBJECT_REQUIRED);
}

function getHeader(headers, name) {
  const h = headers?.find(h => h.name?.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

function decodeBase64Url(str) {
  if (!str) return "";
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  try {
    return atob(base64);
  } catch {
    return "";
  }
}

function extractBody(payload) {
  // Try to get text/plain or text/html body
  if (payload.body?.data) {
    return decodeBase64Url(payload.body.data);
  }
  if (payload.parts) {
    // Prefer text/plain
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Fallback to text/html
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        return decodeBase64Url(part.body.data);
      }
    }
    // Recurse into nested parts
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = extractBody(part);
        if (nested) return nested;
      }
    }
  }
  return "";
}

// Attempt to parse tenant credentials from email body
// This is a placeholder parser - will be finalized once Leon provides a sample email
function attemptParse(body) {
  const result = { parsed: false, tenantId: null, tenantDomain: null, adminUsername: null, adminPassword: null };

  // Look for admin@*.onmicrosoft.com
  const usernameMatch = body.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9-]+\.onmicrosoft\.com)/i);
  if (usernameMatch) {
    result.adminUsername = usernameMatch[1];
    const domainMatch = usernameMatch[1].match(/@(.+\.onmicrosoft\.com)/i);
    if (domainMatch) result.tenantDomain = domainMatch[1];
  }

  // Look for tenant/directory ID (UUID near relevant keywords)
  const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
  const uuids = body.match(uuidPattern);
  if (uuids) {
    // Try to find one near "tenant" or "directory"
    const tenantIdArea = body.match(/(?:tenant|directory)\s*(?:id|ID)?[:\s]*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (tenantIdArea) {
      result.tenantId = tenantIdArea[1];
    } else {
      result.tenantId = uuids[0]; // fallback to first UUID
    }
  }

  // Look for password near keywords (handles HTML tags like <strong>Password:</strong> value)
  const pwdMatch = body.match(/(?:initial password|temporary password|password)\s*(?:<[^>]*>)*[:\s]*(?:<[^>]*>)*\s*([^\s<\n\r]{4,40})/i);
  if (pwdMatch) {
    result.adminPassword = pwdMatch[1].replace(/[.,;]$/, "");
  }

  result.parsed = !!(result.adminUsername || result.tenantId);
  return result;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { action } = body;

  // ── Webhook handler (called by connector automation) ──
  if (action === "processEmails") {
    const { messageIds } = body;
    if (!messageIds || !messageIds.length) {
      return Response.json({ processed: 0, note: "No message IDs provided" });
    }

    // Check kill switch
    const killSettings = await base44.asServiceRole.entities.AppSettings.filter({ key: "gmail_processing_paused" });
    if (killSettings.length > 0 && killSettings[0].value === "true") {
      console.log("[GMAIL] Processing paused (kill switch active). Skipping.");
      return Response.json({ processed: 0, note: "Processing paused by admin" });
    }

    // Rate limit check
    const tenMinAgo = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const recentLogs = await base44.asServiceRole.entities.GmailEmailLog.filter({ matched: true });
    const recentMatched = recentLogs.filter(l => l.created_date > tenMinAgo).length;
    if (recentMatched >= RATE_LIMIT_MAX) {
      console.log("[GMAIL] Rate limit hit. Pausing processing.");
      await base44.asServiceRole.entities.TenantAuditLog.create({
        action: "rate_limit_triggered",
        detail: `${recentMatched} matched emails in last 10 minutes. Processing paused.`,
      });
      // Auto-enable kill switch
      const existing = await base44.asServiceRole.entities.AppSettings.filter({ key: "gmail_processing_paused" });
      if (existing.length > 0) {
        await base44.asServiceRole.entities.AppSettings.update(existing[0].id, { value: "true" });
      } else {
        await base44.asServiceRole.entities.AppSettings.create({ key: "gmail_processing_paused", value: "true" });
      }
      return Response.json({ processed: 0, note: "Rate limit triggered" });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection("gmail");
    const results = [];

    for (const messageId of messageIds) {
      // Dedup check
      const existingLogs = await base44.asServiceRole.entities.GmailEmailLog.filter({ gmail_message_id: messageId });
      if (existingLogs.length > 0) {
        results.push({ messageId, status: "skipped", reason: "already processed" });
        continue;
      }

      // Fetch full message
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (!msgRes.ok) {
        console.error(`[GMAIL] Failed to fetch message ${messageId}: ${msgRes.status}`);
        results.push({ messageId, status: "error", reason: `HTTP ${msgRes.status}` });
        continue;
      }

      const message = await msgRes.json();
      const headers = message.payload?.headers || [];
      const from = getHeader(headers, "From");
      const subject = getHeader(headers, "Subject");
      const dateStr = getHeader(headers, "Date");
      const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();

      const senderMatch = matchesSenderFilter(from);
      const subjectMatch = matchesSubjectFilter(subject);
      const matched = senderMatch && subjectMatch;

      // Log every email we see
      const emailLog = await base44.asServiceRole.entities.GmailEmailLog.create({
        gmail_message_id: messageId,
        from,
        subject,
        received_at: receivedAt,
        matched,
        processed: false,
        processing_notes: matched ? "Matched filter, processing..." : `Not matched (sender: ${senderMatch}, subject: ${subjectMatch})`,
      });

      await base44.asServiceRole.entities.TenantAuditLog.create({
        action: matched ? "email_matched" : "email_skipped",
        gmail_message_id: messageId,
        detail: `From: ${from} | Subject: ${subject}`,
      });

      if (!matched) {
        results.push({ messageId, status: "skipped", reason: "filter mismatch" });
        continue;
      }

      // Extract body
      const emailBody = extractBody(message.payload);

      // Attempt parsing
      const parsed = attemptParse(emailBody);

      if (!parsed.parsed) {
        // Store as awaiting_parser
        const tenant = await base44.asServiceRole.entities.TenantLifecycle.create({
          overall_status: "awaiting_parser",
          provisioning_email_message_id: messageId,
          provisioning_email_received_at: receivedAt,
          provisioning_email_raw_body: emailBody.substring(0, 50000),
          flags: "awaiting_parser",
        });

        await base44.asServiceRole.entities.GmailEmailLog.update(emailLog.id, {
          processed: true,
          tenant_lifecycle_id: tenant.id,
          processing_notes: "Matched but parser could not extract credentials. Stored for manual review.",
        });

        await base44.asServiceRole.entities.TenantAuditLog.create({
          action: "email_received",
          tenant_lifecycle_id: tenant.id,
          gmail_message_id: messageId,
          detail: "Parser could not extract credentials. Flagged for review.",
        });

        results.push({ messageId, status: "awaiting_parser", tenantId: tenant.id });
        continue;
      }

      // Check for duplicate tenant ID
      if (parsed.tenantId) {
        const existingTenants = await base44.asServiceRole.entities.TenantLifecycle.filter({ ms_tenant_id: parsed.tenantId });
        if (existingTenants.length > 0) {
          await base44.asServiceRole.entities.TenantAuditLog.create({
            action: "email_duplicate",
            gmail_message_id: messageId,
            tenant_lifecycle_id: existingTenants[0].id,
            detail: `Duplicate tenant ID ${parsed.tenantId} found on existing record ${existingTenants[0].id}`,
          });

          await base44.asServiceRole.entities.GmailEmailLog.update(emailLog.id, {
            processed: true,
            processing_notes: `Duplicate tenant ID: ${parsed.tenantId}`,
          });

          results.push({ messageId, status: "duplicate", existingRecordId: existingTenants[0].id });
          continue;
        }
      }

      // Try to match to existing TenantLifecycle by domain
      let linkedRecord = null;
      let matchMethod = "none";

      if (parsed.tenantDomain) {
        const domainPrefix = parsed.tenantDomain.replace(/\.onmicrosoft\.com$/i, "");
        const existingByDomain = await base44.asServiceRole.entities.TenantLifecycle.filter({ ms_domain: domainPrefix });
        if (existingByDomain.length > 0) {
          linkedRecord = existingByDomain[0];
          matchMethod = "domain";
        }
      }

      if (linkedRecord) {
        // Update existing record
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
          processed: true,
          tenant_lifecycle_id: linkedRecord.id,
          processing_notes: `Linked to existing record via ${matchMethod} match`,
        });

        await base44.asServiceRole.entities.TenantAuditLog.create({
          action: "email_linked",
          tenant_lifecycle_id: linkedRecord.id,
          gmail_message_id: messageId,
          detail: `Matched via ${matchMethod}. Domain: ${parsed.tenantDomain}`,
        });

        results.push({ messageId, status: "linked", tenantId: linkedRecord.id, matchMethod });
      } else {
        // Create new unmatched record
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
          processed: true,
          tenant_lifecycle_id: tenant.id,
          processing_notes: "No existing order record matched. Created as unmatched.",
        });

        await base44.asServiceRole.entities.TenantAuditLog.create({
          action: "email_parsed",
          tenant_lifecycle_id: tenant.id,
          gmail_message_id: messageId,
          detail: `Created unmatched record. Domain: ${parsed.tenantDomain || "unknown"}`,
        });

        results.push({ messageId, status: "unmatched", tenantId: tenant.id });
      }
    }

    return Response.json({ processed: results.length, results });
  }

  // ── getStatus: return processing status for admin UI ──
  if (action === "getStatus") {
    const killSettings = await base44.asServiceRole.entities.AppSettings.filter({ key: "gmail_processing_paused" });
    const isPaused = killSettings.length > 0 && killSettings[0].value === "true";
    return Response.json({ paused: isPaused });
  }

  // ── togglePause ──
  if (action === "togglePause") {
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin required" }, { status: 403 });
    }

    const existing = await base44.asServiceRole.entities.AppSettings.filter({ key: "gmail_processing_paused" });
    const currentVal = existing.length > 0 ? existing[0].value : "false";
    const newVal = currentVal === "true" ? "false" : "true";

    if (existing.length > 0) {
      await base44.asServiceRole.entities.AppSettings.update(existing[0].id, { value: newVal });
    } else {
      await base44.asServiceRole.entities.AppSettings.create({ key: "gmail_processing_paused", value: newVal });
    }

    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: newVal === "true" ? "processing_paused" : "processing_resumed",
      performed_by: user.email,
      detail: `Email processing ${newVal === "true" ? "paused" : "resumed"} by admin`,
    });

    return Response.json({ paused: newVal === "true" });
  }

  // ── revealPassword ──
  if (action === "revealPassword") {
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Admin required" }, { status: 403 });
    }

    const { tenantLifecycleId } = body;
    if (!tenantLifecycleId) return Response.json({ error: "tenantLifecycleId required" });

    const records = await base44.asServiceRole.entities.TenantLifecycle.filter({ id: tenantLifecycleId });
    if (records.length === 0) return Response.json({ error: "Record not found" });

    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: "password_revealed",
      tenant_lifecycle_id: tenantLifecycleId,
      performed_by: user.email,
      detail: `Password revealed for tenant ${records[0].ms_tenant_domain || tenantLifecycleId}`,
    });

    return Response.json({ password: records[0].ms_admin_password_encrypted || "" });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
});
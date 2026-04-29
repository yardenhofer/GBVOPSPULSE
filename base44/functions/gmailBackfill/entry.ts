import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// Scans Gmail for recent Pax8 fulfillment emails that were missed (e.g. during a pause)
// and processes any that haven't been logged yet.

const SENDER_QUERY = 'from:pax8.com subject:"microsoft software order fulfilled"';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const body = await req.json();
  const maxResults = body.maxResults || 100;

  const { accessToken } = await base44.asServiceRole.connectors.getConnection("gmail");

  // Search Gmail for recent Pax8 fulfillment emails
  const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(SENDER_QUERY)}&maxResults=${maxResults}`;
  console.log(`[BACKFILL] Searching Gmail: ${SENDER_QUERY} (max ${maxResults})`);
  const searchRes = await fetch(searchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    return Response.json({ error: `Gmail search failed: HTTP ${searchRes.status} — ${errText.substring(0, 200)}` });
  }

  const searchData = await searchRes.json();
  const messages = searchData.messages || [];
  console.log(`[BACKFILL] Found ${messages.length} matching emails in Gmail`);

  if (messages.length === 0) {
    return Response.json({ found: 0, newMessages: 0, processed: 0 });
  }

  // Get all existing email log IDs to find unprocessed ones
  const existingLogs = await base44.asServiceRole.entities.GmailEmailLog.list("-created_date", 500);
  const processedIds = new Set(existingLogs.map(l => l.gmail_message_id));

  const newMessageIds = messages.map(m => m.id).filter(id => !processedIds.has(id));
  console.log(`[BACKFILL] ${newMessageIds.length} unprocessed emails found (${messages.length - newMessageIds.length} already in log)`);

  if (newMessageIds.length === 0) {
    return Response.json({ found: messages.length, newMessages: 0, processed: 0 });
  }

  // Process in batches of 10 to avoid timeouts
  const BATCH_SIZE = 10;
  const allResults = [];

  for (let i = 0; i < newMessageIds.length; i += BATCH_SIZE) {
    const batch = newMessageIds.slice(i, i + BATCH_SIZE);
    console.log(`[BACKFILL] Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} messages`);

    const result = await base44.asServiceRole.functions.invoke("gmailTenantWatch", {
      action: "processEmails",
      messageIds: batch,
    });

    if (result.data?.results) {
      allResults.push(...result.data.results);
    }
  }

  const linked = allResults.filter(r => r.status === "linked").length;
  const unmatched = allResults.filter(r => r.status === "unmatched").length;
  const duplicates = allResults.filter(r => r.status === "duplicate").length;
  const skipped = allResults.filter(r => r.status === "skipped").length;
  const errors = allResults.filter(r => r.status === "error").length;
  const awaitingParser = allResults.filter(r => r.status === "awaiting_parser").length;

  console.log(`[BACKFILL] Done. Linked: ${linked}, Unmatched: ${unmatched}, Duplicates: ${duplicates}, Skipped: ${skipped}, Errors: ${errors}`);

  await base44.asServiceRole.entities.TenantAuditLog.create({
    action: "processing_resumed",
    performed_by: user.email,
    detail: `Gmail backfill: processed ${allResults.length} emails. Linked: ${linked}, Unmatched: ${unmatched}, Duplicates: ${duplicates}, Parser: ${awaitingParser}, Errors: ${errors}`,
  });

  return Response.json({
    found: messages.length,
    newMessages: newMessageIds.length,
    processed: allResults.length,
    summary: { linked, unmatched, duplicates, skipped, errors, awaitingParser },
    results: allResults,
  });
});
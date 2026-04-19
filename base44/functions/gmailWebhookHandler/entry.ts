import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// This function is triggered by the Gmail connector automation.
// It receives pre-enriched data with new_message_ids from the platform.
// It then calls gmailTenantWatch to do the actual processing.

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();

  const messageIds = body.data?.new_message_ids ?? [];

  if (!messageIds.length) {
    console.log("[GMAIL WEBHOOK] No new messages in this notification");
    return Response.json({ ok: true, processed: 0 });
  }

  console.log(`[GMAIL WEBHOOK] Received ${messageIds.length} new message(s): ${messageIds.join(", ")}`);

  // Delegate to the processing function
  const result = await base44.asServiceRole.functions.invoke("gmailTenantWatch", {
    action: "processEmails",
    messageIds,
  });

  console.log(`[GMAIL WEBHOOK] Processing result:`, JSON.stringify(result.data));
  return Response.json({ ok: true, result: result.data });
});
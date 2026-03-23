import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const clients = await base44.asServiceRole.entities.Client.list("-updated_date", 200);

  const eligible = clients.filter(c => c.slack_channel_id || c.slack_channel_name);
  console.log(`${eligible.length} clients eligible for Slack analysis (${clients.length - eligible.length} skipped — no channel)`);

  if (eligible.length === 0) {
    return Response.json({ success: true, message: "No clients to analyze", processed: 0 });
  }

  const results = [];
  const errors = [];

  // Process one client at a time — if it fails, retry once
  for (const client of eligible) {
    let success = false;
    let lastError = null;

    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(`[${attempt === 1 ? 'RUN' : 'RETRY'}] Analyzing: ${client.name} (${client.id})`);
        const res = await base44.asServiceRole.functions.invoke('slackSentimentAnalysis', {
          client_id: client.id
        });
        const sentiment = res?.data?.results?.[0]?.sentiment || res?.data?.analyzed ? 'done' : 'unknown';
        console.log(`✓ ${client.name}: ${sentiment}`);
        results.push({ client: client.name, status: "success", sentiment, attempt });
        success = true;
        break;
      } catch (err) {
        lastError = err?.message || String(err);
        console.error(`✗ ${client.name} (attempt ${attempt}): ${lastError}`);
      }
    }

    if (!success) {
      console.error(`✗✗ ${client.name}: FAILED after 2 attempts — ${lastError}`);
      errors.push({ client: client.name, error: lastError });
    }
  }

  console.log(`Done: ${results.length} succeeded, ${errors.length} failed`);
  if (errors.length > 0) {
    console.error(`Failed clients: ${errors.map(e => e.client).join(', ')}`);
  }

  return Response.json({
    success: true,
    processed: results.length,
    failed: errors.length,
    results,
    errors
  });
});
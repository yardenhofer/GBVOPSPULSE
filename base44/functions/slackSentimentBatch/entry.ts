import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const clients = await base44.asServiceRole.entities.Client.list("-updated_date", 200);

  if (clients.length === 0) {
    return Response.json({ success: true, message: "No clients to analyze" });
  }

  // Filter to clients that have a Slack channel configured
  const eligible = clients.filter(c => c.slack_channel_id || c.slack_channel_name);
  console.log(`${eligible.length} clients eligible for Slack analysis (${clients.length - eligible.length} skipped — no channel)`);

  const results = [];
  const errors = [];

  // Process in parallel batches of 5 to stay within CPU time limits
  const BATCH_SIZE = 5;
  for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
    const batch = eligible.slice(i, i + BATCH_SIZE);
    console.log(`Processing batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.map(c => c.name).join(', ')}`);

    const batchResults = await Promise.allSettled(
      batch.map(async (client) => {
        const res = await base44.asServiceRole.functions.invoke('slackSentimentAnalysis', {
          client_id: client.id
        });
        return { client: client.name, status: "success", sentiment: res?.data?.results?.[0]?.sentiment };
      })
    );

    for (let j = 0; j < batchResults.length; j++) {
      const r = batchResults[j];
      if (r.status === 'fulfilled') {
        console.log(`✓ ${r.value.client}: ${r.value.sentiment || 'done'}`);
        results.push(r.value);
      } else {
        const clientName = batch[j].name;
        console.error(`✗ ${clientName}: ${r.reason?.message || r.reason}`);
        errors.push({ client: clientName, error: r.reason?.message || String(r.reason) });
      }
    }
  }

  return Response.json({
    success: true,
    processed: results.length,
    failed: errors.length,
    results,
    errors
  });
});
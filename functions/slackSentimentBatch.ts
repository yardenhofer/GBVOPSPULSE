import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Get all clients
  const clients = await base44.asServiceRole.entities.Client.list("-updated_date", 200);
  
  if (clients.length === 0) {
    return Response.json({ success: true, message: "No clients to analyze" });
  }

  const results = [];
  const errors = [];

  // Process one client at a time sequentially, each as its own function call
  for (const client of clients) {
    // Skip clients with no Slack channel configured
    if (!client.slack_channel_id && !client.slack_channel_name) {
      console.log(`Skipping "${client.name}" — no Slack channel configured`);
      continue;
    }

    try {
      console.log(`Dispatching analysis for "${client.name}" (${client.id})...`);
      const res = await base44.asServiceRole.functions.invoke('slackSentimentAnalysis', {
        client_id: client.id
      });
      console.log(`✓ Completed "${client.name}": ${JSON.stringify(res?.data?.results?.[0]?.sentiment || 'done')}`);
      results.push({ client: client.name, status: "success" });
    } catch (err) {
      console.error(`✗ Failed "${client.name}": ${err.message}`);
      errors.push({ client: client.name, error: err.message });
      // Continue to next client — don't let one failure stop the batch
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
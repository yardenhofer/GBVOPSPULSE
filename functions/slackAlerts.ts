import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (!slackWebhookUrl) {
      return Response.json({ error: 'SLACK_WEBHOOK_URL not configured' }, { status: 500 });
    }

    // Called from entity automation — payload has event + data
    const { event, data } = body;

    if (!data) {
      return Response.json({ skipped: true, reason: 'no data' });
    }

    // Only alert on Critical or Escalated clients
    const isCritical = data.status === 'Critical' || data.is_escalated;
    if (!isCritical) {
      return Response.json({ skipped: true, reason: 'not critical' });
    }

    const flags = [];
    const now = new Date();

    if (data.waiting_on_leads && data.waiting_since) {
      const days = Math.floor((now - new Date(data.waiting_since)) / 86400000);
      if (days >= 2) flags.push(`⛔ Waiting ${days}d for lead list`);
    }
    if (data.last_am_touchpoint) {
      const days = Math.floor((now - new Date(data.last_am_touchpoint)) / 86400000);
      if (days >= 3) flags.push(`🕒 No AM touchpoint for ${days} days`);
    }
    if (data.is_escalated) flags.push('⚠️ Client escalated');
    if (data.client_sentiment === 'Unhappy') flags.push('😡 Client unhappy');

    const slackPayload = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `🚨 Critical Alert: ${data.name}`, emoji: true }
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Status:* ${data.status}` },
            { type: 'mrkdwn', text: `*AM:* ${data.assigned_am || 'Unassigned'}` },
            { type: 'mrkdwn', text: `*Package:* ${data.package_type || '—'}` },
            { type: 'mrkdwn', text: `*Revenue:* ${data.revenue ? `$${data.revenue.toLocaleString()}/mo` : '—'}` },
          ]
        },
        ...(flags.length > 0 ? [{
          type: 'section',
          text: { type: 'mrkdwn', text: `*Flags:*\n${flags.map(f => `• ${f}`).join('\n')}` }
        }] : []),
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `OpsControl · ${new Date().toISOString().slice(0, 10)}` }]
        }
      ]
    };

    const slackRes = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(slackPayload),
    });

    return Response.json({ success: slackRes.ok, status: slackRes.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
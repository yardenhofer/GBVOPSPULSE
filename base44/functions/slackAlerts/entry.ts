import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const opsAlertsUrl = Deno.env.get('SLACK_WEBHOOK_URL_OPS_ALERTS');
    const criticalUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (!opsAlertsUrl) {
      return Response.json({ error: 'SLACK_WEBHOOK_URL_OPS_ALERTS not set' }, { status: 500 });
    }

    const { message, client_name, severity, alert_type } = await req.json();

    const colorMap = { Red: '#E53E3E', Yellow: '#D69E2E' };
    const emojiMap = { Red: '🚨', Yellow: '⚠️' };
    const color = colorMap[severity] || '#718096';
    const emoji = emojiMap[severity] || 'ℹ️';

    const payload = {
      attachments: [
        {
          color,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `${emoji} *OpsControl Alert* — ${severity} Severity`,
              },
            },
            {
              type: 'section',
              fields: [
                { type: 'mrkdwn', text: `*Client:*\n${client_name}` },
                { type: 'mrkdwn', text: `*Alert Type:*\n${alert_type}` },
              ],
            },
            {
              type: 'section',
              text: { type: 'mrkdwn', text: `*Details:*\n${message}` },
            },
            {
              type: 'context',
              elements: [
                { type: 'mrkdwn', text: `Sent by ${user.full_name} (${user.email}) via OpsControl` },
              ],
            },
          ],
        },
      ],
    };

    const body = JSON.stringify(payload);
    const headers = { 'Content-Type': 'application/json' };

    // Always send to #GBV-Ops-alerts
    const slackRes = await fetch(opsAlertsUrl, { method: 'POST', headers, body });
    if (!slackRes.ok) {
      const text = await slackRes.text();
      return Response.json({ error: `Slack error: ${text}` }, { status: 500 });
    }

    // Critical alerts also go to the original channel
    if (severity === 'Red' && criticalUrl) {
      await fetch(criticalUrl, { method: 'POST', headers, body });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (!webhookUrl) {
      return Response.json({ error: 'SLACK_WEBHOOK_URL not set' }, { status: 500 });
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

    const slackRes = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!slackRes.ok) {
      const text = await slackRes.text();
      return Response.json({ error: `Slack error: ${text}` }, { status: 500 });
    }

    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

async function sendSlack(webhookUrl, { color, emoji, title, fields, footer }) {
  const payload = {
    attachments: [
      {
        color,
        blocks: [
          {
            type: 'section',
            text: { type: 'mrkdwn', text: `${emoji} *GBV Ops Alert — ${title}*` },
          },
          {
            type: 'section',
            fields: fields.map(f => ({ type: 'mrkdwn', text: f })),
          },
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: footer }],
          },
        ],
      },
    ],
  };
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow scheduled calls (no user) or admin users
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (!webhookUrl) {
      return Response.json({ error: 'SLACK_WEBHOOK_URL not set' }, { status: 500 });
    }

    const body = await req.json().catch(() => ({}));
    const { trigger, client_id } = body;

    const now = new Date();

    // ── Trigger: client just escalated ──────────────────────────────────────
    if (trigger === 'escalated') {
      const client = await base44.asServiceRole.entities.Client.get(client_id);
      if (!client) return Response.json({ error: 'Client not found' }, { status: 404 });

      await sendSlack(webhookUrl, {
        color: '#E53E3E',
        emoji: '🚨',
        title: 'Client Escalated',
        fields: [
          `*Client:*\n${client.name}`,
          `*AM:*\n${client.assigned_am || '—'}`,
          `*Package:*\n${client.package_type || '—'}`,
          `*Revenue:*\n$${client.revenue || 0}/mo`,
        ],
        footer: `Escalated on ${now.toLocaleDateString('en-US')} — requires leadership review`,
      });

      return Response.json({ ok: true, sent: 'escalated' });
    }

    // ── Trigger: scheduled scan (critical + no CRM update in 2 days) ────────
    if (trigger === 'scan' || !trigger) {
      const clients = await base44.asServiceRole.entities.Client.list();
      const alerts = [];

      for (const client of clients) {
        const flags = [];

        // Went critical: is_escalated OR status is Critical
        const isCritical = client.is_escalated || client.status === 'Critical';

        // No CRM update (last_client_reply_date) in 2+ days AND critical
        if (isCritical && client.last_client_reply_date) {
          const daysSinceReply = Math.floor(
            (now - new Date(client.last_client_reply_date)) / (1000 * 60 * 60 * 24)
          );
          if (daysSinceReply >= 2) {
            flags.push(`⏰ No CRM update for *${daysSinceReply} days*`);
          }
        } else if (isCritical && !client.last_client_reply_date) {
          flags.push(`⏰ No CRM update on record`);
        }

        if (isCritical && flags.length > 0) {
          alerts.push({ client, flags });
        }
      }

      for (const { client, flags } of alerts) {
        await sendSlack(webhookUrl, {
          color: '#E53E3E',
          emoji: '🔴',
          title: 'Critical Client — Needs Attention',
          fields: [
            `*Client:*\n${client.name}`,
            `*AM:*\n${client.assigned_am || '—'}`,
            `*Issues:*\n${flags.join('\n')}`,
            `*Revenue:*\n$${client.revenue || 0}/mo`,
          ],
          footer: `Auto-scan on ${now.toLocaleDateString('en-US')}`,
        });
      }

      return Response.json({ ok: true, alerts_sent: alerts.length });
    }

    return Response.json({ error: 'Unknown trigger' }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
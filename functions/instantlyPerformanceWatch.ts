import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';

async function fetchInstantly(path, apiKey) {
  const res = await fetch(`${INSTANTLY_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`Instantly API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function sendSlack(webhookUrl, payload) {
  await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (!webhookUrl) return Response.json({ error: 'SLACK_WEBHOOK_URL not set' }, { status: 500 });

    const clients = await base44.asServiceRole.entities.Client.list('-updated_date', 200);
    const clientsWithKey = clients.filter(c => c.instantly_api_key);

    const alerts = [];
    const results = [];

    for (const client of clientsWithKey) {
      try {
        const analyticsRes = await fetchInstantly('/campaigns/analytics', client.instantly_api_key);
        const items = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes?.items || []);

        let totalSent = 0, totalOpens = 0, totalReplies = 0, totalOpportunities = 0, totalBounced = 0;
        for (const item of items) {
          totalSent          += item.emails_sent_count   || 0;
          totalOpens         += item.open_count_unique   || 0;
          totalReplies       += item.reply_count_unique  || 0;
          totalOpportunities += item.total_opportunities || 0;
          totalBounced       += item.bounced_count       || 0;
        }

        const openRate  = totalSent > 0 ? Math.round((totalOpens   / totalSent) * 100) : 0;
        const replyRate = totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0;
        const bounceRate = totalSent > 0 ? Math.round((totalBounced / totalSent) * 100) : 0;

        const issues = [];

        // Performance thresholds — flag when below industry benchmarks
        if (totalSent > 100 && openRate < 20) {
          issues.push(`📉 Low open rate: *${openRate}%* (benchmark: 20%+)`);
        }
        if (totalSent > 100 && replyRate < 2) {
          issues.push(`📉 Low reply rate: *${replyRate}%* (benchmark: 2%+)`);
        }
        if (totalSent > 100 && bounceRate > 5) {
          issues.push(`⚠️ High bounce rate: *${bounceRate}%* (threshold: 5%)`);
        }
        if (totalOpportunities === 0 && totalSent > 500) {
          issues.push(`🚫 Zero opportunities from ${totalSent.toLocaleString()} emails sent`);
        }

        results.push({ client: client.name, openRate, replyRate, bounceRate, opportunities: totalOpportunities, issues: issues.length });

        if (issues.length > 0) {
          alerts.push({ client, issues, openRate, replyRate, totalSent });
        }
      } catch (err) {
        results.push({ client: client.name, error: err.message });
      }
    }

    // Send one Slack alert per underperforming client
    for (const { client, issues } of alerts) {
      await sendSlack(webhookUrl, {
        attachments: [{
          color: '#F97316',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `📉 *Instantly Performance Alert — ${client.name}*` } },
            { type: 'section', fields: [
              { type: 'mrkdwn', text: `*AM:*\n${client.assigned_am || '—'}` },
              { type: 'mrkdwn', text: `*Package:*\n${client.package_type || '—'}` },
              { type: 'mrkdwn', text: `*Issues:*\n${issues.join('\n')}` },
              { type: 'mrkdwn', text: `*Revenue:*\n$${client.revenue || 0}/mo` },
            ]},
            { type: 'context', elements: [{ type: 'mrkdwn', text: `Auto-scanned · ${new Date().toLocaleDateString('en-US')} · Review in GBV Ops Center` }] },
          ],
        }],
      });
    }

    return Response.json({ ok: true, scanned: clientsWithKey.length, alerts_sent: alerts.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
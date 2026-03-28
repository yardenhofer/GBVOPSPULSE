import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';

async function fetchInstantly(path, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${INSTANTLY_API}${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Instantly API error ${res.status}: ${await res.text()}`);
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
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

    const rawClients = await base44.asServiceRole.entities.Client.list('-updated_date', 200);
    const clients = Array.isArray(rawClients) ? rawClients : (rawClients?.items || rawClients?.data || rawClients?.results || []);
    const clientsWithKey = clients.filter(c => c.instantly_api_key);

    const opsAlertsUrl = Deno.env.get('SLACK_WEBHOOK_URL_OPS_ALERTS');
    const criticalUrl = webhookUrl; // original channel for critical duplicates
    const slackTarget = opsAlertsUrl || webhookUrl;

    const alerts = [];
    const results = [];

    for (const client of clientsWithKey) {
      try {
        // Fetch campaigns to check lead consumption
        const campaignsRes = await fetchInstantly('/campaigns?status=active&limit=100', client.instantly_api_key);
        const campaigns = Array.isArray(campaignsRes) ? campaignsRes : (campaignsRes?.items || []);

        const issues = [];
        let totalLeads = 0;
        let totalCompleted = 0;

        for (const campaign of campaigns) {
          const leadsCount = campaign.leads_count || 0;
          const completedCount = campaign.completed_count || 0;
          totalLeads += leadsCount;
          totalCompleted += completedCount;

          // Flag campaigns where 80%+ of leads have completed the sequence
          if (leadsCount > 0) {
            const completionPct = Math.round((completedCount / leadsCount) * 100);
            if (completionPct >= 80) {
              issues.push(`🔴 Campaign "*${campaign.name}*" is ${completionPct}% through its lead list (${completedCount.toLocaleString()}/${leadsCount.toLocaleString()} completed)`);
            }
          }
        }

        // Flag if no active campaigns at all
        if (campaigns.length === 0) {
          issues.push(`⚠️ No active campaigns found`);
        }

        // Flag if leads are running very low overall (< 50 remaining across all campaigns)
        const remaining = totalLeads - totalCompleted;
        if (totalLeads > 0 && remaining < 50 && remaining >= 0) {
          issues.push(`🚨 Only *${remaining}* leads remaining across all active campaigns`);
        }

        results.push({ client: client.name, active_campaigns: campaigns.length, totalLeads, totalCompleted, remaining: totalLeads - totalCompleted, issues: issues.length });

        if (issues.length > 0) {
          alerts.push({ client, issues });
        }
      } catch (err) {
        results.push({ client: client.name, error: err.message });
      }
    }

    // Send one Slack alert per flagged client
    for (const { client, issues } of alerts) {
      const payload = {
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
      };
      await sendSlack(slackTarget, payload);
      // Also send to critical channel if it's a lead shortage issue
      if (criticalUrl && criticalUrl !== slackTarget) {
        await sendSlack(criticalUrl, payload);
      }
    }

    return Response.json({ ok: true, scanned: clientsWithKey.length, alerts_sent: alerts.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
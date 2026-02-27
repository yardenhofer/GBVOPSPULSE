import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

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
    const alerts = [];

    for (const client of clients) {
      // Lead list 80%+ consumed: leads_this_week >= 80% of target AND no new list incoming
      if (!client.target_leads_per_week || client.target_leads_per_week <= 0) continue;

      // Fetch the most recent lead list for this client
      const leadLists = await base44.asServiceRole.entities.LeadList.filter(
        { client_id: client.id }, '-updated_date', 1
      );
      const latestList = leadLists[0];
      if (!latestList) continue;

      // Calculate how "consumed" the lead list is based on leads sent this week vs target
      const leadsThisWeek = client.leads_this_week || 0;
      const target = client.target_leads_per_week;
      const pctConsumed = Math.round((leadsThisWeek / target) * 100);

      const issues = [];

      // 80%+ consumed and not already on a new list
      if (pctConsumed >= 80 && latestList.status !== 'Live' && latestList.status !== 'Being Built') {
        issues.push(`📋 Lead list *${pctConsumed}% consumed* (${leadsThisWeek}/${target} leads used this week)`);
        issues.push(`Current list status: *${latestList.status || 'Unknown'}*`);
      }

      // List is overdue — no expected_next_date or it has passed
      if (latestList.expected_next_date) {
        const daysOverdue = Math.floor((new Date() - new Date(latestList.expected_next_date)) / 86400000);
        if (daysOverdue > 0) {
          issues.push(`⏰ Expected new list was *${daysOverdue} day${daysOverdue !== 1 ? 's' : ''} ago* — not received`);
        }
      }

      // Waiting on leads for 5+ days
      if (client.waiting_on_leads && client.waiting_since) {
        const daysWaiting = Math.floor((new Date() - new Date(client.waiting_since)) / 86400000);
        if (daysWaiting >= 5) {
          issues.push(`🚫 Waiting on leads for *${daysWaiting} days*`);
        }
      }

      if (issues.length > 0) {
        alerts.push({ client, issues, pctConsumed });
      }
    }

    for (const { client, issues } of alerts) {
      await sendSlack(webhookUrl, {
        attachments: [{
          color: '#8B5CF6',
          blocks: [
            { type: 'section', text: { type: 'mrkdwn', text: `📋 *Lead List Alert — ${client.name}*` } },
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

    return Response.json({ ok: true, scanned: clients.length, alerts_sent: alerts.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
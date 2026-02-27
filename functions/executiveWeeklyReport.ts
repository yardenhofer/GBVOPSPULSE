import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const webhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (!webhookUrl) return Response.json({ error: 'SLACK_WEBHOOK_URL not set' }, { status: 500 });

    const clients = await base44.asServiceRole.entities.Client.list('-updated_date', 200);
    const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    const totalRevenue = clients.reduce((sum, c) => sum + (c.revenue || 0), 0);
    const critical = clients.filter(c => c.status === 'Critical' || c.is_escalated);
    const atRisk = clients.filter(c => c.status === 'At Risk');
    const healthy = clients.filter(c => c.status === 'Healthy');
    const monitor = clients.filter(c => c.status === 'Monitor');
    const unhappy = clients.filter(c => c.client_sentiment === 'Unhappy' || c.client_sentiment === 'Slightly Concerned');
    const waitingLeads = clients.filter(c => c.waiting_on_leads);

    // Revenue at risk: clients that are Critical or Escalated
    const revenueAtRisk = critical.reduce((sum, c) => sum + (c.revenue || 0), 0);

    // Lead performance this week
    const clientsWithLeadTarget = clients.filter(c => c.target_leads_per_week > 0);
    const underperforming = clientsWithLeadTarget.filter(c => {
      const pct = ((c.leads_this_week || 0) / c.target_leads_per_week) * 100;
      return pct < 70;
    });

    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `📊 *GBV Ops — Weekly Executive Report*\n_${today}_`,
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Total Clients:*\n${clients.length}` },
          { type: 'mrkdwn', text: `*Monthly Revenue:*\n$${totalRevenue.toLocaleString()}` },
          { type: 'mrkdwn', text: `*Revenue at Risk:*\n$${revenueAtRisk.toLocaleString()} (${critical.length} clients)` },
          { type: 'mrkdwn', text: `*Unhappy / Concerned:*\n${unhappy.length} clients` },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: [
            `*Health Breakdown:*`,
            `🟢 Healthy: *${healthy.length}*  |  🟡 Monitor: *${monitor.length}*  |  🟠 At Risk: *${atRisk.length}*  |  🔴 Critical: *${critical.length}*`,
          ].join('\n'),
        },
      },
    ];

    if (critical.length > 0) {
      const lines = critical.map(c => `• *${c.name}* — $${(c.revenue||0).toLocaleString()}/mo · AM: ${c.assigned_am || '—'}`).join('\n');
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `🚨 *Critical / Escalated Clients:*\n${lines}` } });
    }

    if (underperforming.length > 0) {
      const lines = underperforming.map(c => {
        const pct = Math.round(((c.leads_this_week||0) / c.target_leads_per_week) * 100);
        return `• *${c.name}* — ${c.leads_this_week||0}/${c.target_leads_per_week} leads (${pct}% of target)`;
      }).join('\n');
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `📉 *Underperforming Lead Flow (< 70% of target):*\n${lines}` } });
    }

    if (waitingLeads.length > 0) {
      const lines = waitingLeads.map(c => {
        const days = c.waiting_since ? Math.floor((new Date() - new Date(c.waiting_since)) / 86400000) : '?';
        return `• *${c.name}* — waiting ${days} days`;
      }).join('\n');
      blocks.push({ type: 'section', text: { type: 'mrkdwn', text: `📋 *Waiting on Lead Lists:*\n${lines}` } });
    }

    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `Auto-generated weekly executive report · GBV Ops Center` }] });

    await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ attachments: [{ color: '#3B82F6', blocks }] }),
    });

    return Response.json({ ok: true, clients: clients.length, critical: critical.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
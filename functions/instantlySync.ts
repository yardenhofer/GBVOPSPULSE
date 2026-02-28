import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';

async function fetchInstantly(path, apiKey, options = {}) {
  const res = await fetch(`${INSTANTLY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Instantly API error ${res.status}: ${text}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { client_id } = body;

    const clients = await base44.entities.Client.filter({ id: client_id });
    const client = clients[0];
    if (!client) return Response.json({ error: 'Client not found' }, { status: 404 });

    const apiKey = client.instantly_api_key;
    if (!apiKey) return Response.json({ error: 'No Instantly API key configured for this client' }, { status: 400 });

    // Fetch all campaign analytics
    const analyticsRes = await fetchInstantly('/campaigns/analytics', apiKey);
    const allItems = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes?.items || []);

    // Separate active vs all campaigns
    const activeItems = allItems.filter(c => c.campaign_status === 'active');
    // If no active campaigns, still show all for context (so the panel isn't empty)
    const relevantItems = activeItems.length > 0 ? activeItems : allItems;

    // Aggregate stats only from active campaigns (or all if none active)
    let totalSent = 0, totalOpens = 0, totalReplies = 0, totalOpportunities = 0, totalBounced = 0;
    let totalLeads = 0, totalContacted = 0;

    for (const item of relevantItems) {
      totalSent          += item.emails_sent_count   || 0;
      totalOpens         += item.open_count_unique   || 0;
      totalReplies       += item.reply_count_unique  || 0;
      totalOpportunities += item.total_opportunities || 0;
      totalBounced       += item.bounced_count       || 0;
      // leads_count = total leads in campaign, emails_sent_count = already contacted
      totalLeads         += item.leads_count         || 0;
      totalContacted     += item.emails_sent_count   || 0;
    }

    const campaigns = allItems.map(c => ({
      id: c.campaign_id,
      name: c.campaign_name,
      status: c.campaign_status,
      sent: c.emails_sent_count || 0,
      replies: c.reply_count_unique || 0,
      opportunities: c.total_opportunities || 0,
      leads_count: c.leads_count || 0,
    }));

    const stats = {
      campaigns_count: activeItems.length,
      total_campaigns: allItems.length,
      total_sent: totalSent,
      total_opens: totalOpens,
      total_replies: totalReplies,
      total_opportunities: totalOpportunities,
      total_bounced: totalBounced,
      total_leads: totalLeads,
      total_contacted: totalContacted,
      open_rate: totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0,
      reply_rate: totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0,
      last_synced: new Date().toISOString(),
      campaigns: campaigns.slice(0, 20),
      active_only: activeItems.length > 0,
    };

    return Response.json({ stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
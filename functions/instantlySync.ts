import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';

async function fetchInstantly(path, apiKey) {
  const res = await fetch(`${INSTANTLY_API}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
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

    // Get per-campaign analytics (includes campaign_status, leads_count, contacted_count, etc.)
    const analyticsRes = await fetchInstantly('/campaigns/analytics', apiKey);
    const analyticsItems = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes?.items || []);

    // Filter to active campaigns (campaign_status === 1)
    const activeAnalytics = analyticsItems.filter(a => a.campaign_status === 1);
    const hasActive = activeAnalytics.length > 0;
    const relevantAnalytics = hasActive ? activeAnalytics : analyticsItems;

    // Aggregate stats
    let totalSent = 0, totalOpens = 0, totalReplies = 0, totalOpportunities = 0, totalBounced = 0;
    let totalLeads = 0, totalContacted = 0, totalCompleted = 0;

    for (const item of relevantAnalytics) {
      totalSent          += item.emails_sent_count    || 0;
      totalOpens         += item.open_count_unique    || 0;
      totalReplies       += item.reply_count_unique   || 0;
      totalOpportunities += item.total_opportunities  || 0;
      totalBounced       += item.bounced_count        || 0;
      totalLeads         += item.leads_count          || 0;
      totalContacted     += item.contacted_count      || 0;
      totalCompleted     += item.completed_count      || 0;
    }

    // Build campaigns list for display
    const campaigns = analyticsItems.map(a => ({
      id: a.campaign_id,
      name: a.campaign_name,
      status: a.campaign_status === 1 ? 'active' : a.campaign_status === 2 ? 'paused' : a.campaign_status === 3 ? 'completed' : 'other',
      sent: a.emails_sent_count || 0,
      replies: a.reply_count_unique || 0,
      opportunities: a.total_opportunities || 0,
      leads_count: a.leads_count || 0,
      contacted_count: a.contacted_count || 0,   // leads whose sequence has started
      completed_count: a.completed_count || 0,
      bounced_count: a.bounced_count || 0,
    }));

    const stats = {
      campaigns_count: activeAnalytics.length,
      total_campaigns: analyticsItems.length,
      total_sent: totalSent,
      total_opens: totalOpens,
      total_replies: totalReplies,
      total_opportunities: totalOpportunities,
      total_bounced: totalBounced,
      total_leads: totalLeads,
      total_contacted: totalContacted,
      total_completed: totalCompleted,
      open_rate: totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0,
      reply_rate: totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0,
      last_synced: new Date().toISOString(),
      campaigns: campaigns.slice(0, 20),
      active_only: hasActive,
    };

    return Response.json({ stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
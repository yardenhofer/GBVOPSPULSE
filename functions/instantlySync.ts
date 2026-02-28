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
    const { client_id, time_filter } = body;

    // Calculate start_date based on time filter
    let startDate = null;
    const now = new Date();
    if (time_filter === 'day') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];
    } else if (time_filter === 'week') {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      startDate = d.toISOString().split('T')[0];
    } else if (time_filter === 'month') {
      const d = new Date(now);
      d.setDate(d.getDate() - 30);
      startDate = d.toISOString().split('T')[0];
    }

    const clients = await base44.entities.Client.filter({ id: client_id });
    const client = clients[0];
    if (!client) return Response.json({ error: 'Client not found' }, { status: 404 });

    const apiKey = client.instantly_api_key;
    if (!apiKey) return Response.json({ error: 'No Instantly API key configured for this client' }, { status: 400 });

    // Step 1: List campaigns to get statuses (status 1 = Active)
    const campaignsRes = await fetchInstantly('/campaigns?limit=100', apiKey);
    const campaignsList = Array.isArray(campaignsRes) ? campaignsRes : (campaignsRes?.items || []);
    const activeCampaignIds = new Set(campaignsList.filter(c => c.status === 1).map(c => c.id));

    // Step 2: Get per-campaign analytics (with optional date filter)
    const analyticsQuery = startDate ? `/campaigns/analytics?start_date=${startDate}` : '/campaigns/analytics';
    const analyticsRes = await fetchInstantly(analyticsQuery, apiKey);
    const analyticsItems = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes?.items || []);
    const analyticsMap = {};
    for (const a of analyticsItems) analyticsMap[a.campaign_id] = a;

    // Step 3: Filter to active campaigns only (fallback to all if none active)
    const hasActive = activeCampaignIds.size > 0;
    const relevantAnalytics = hasActive
      ? analyticsItems.filter(a => activeCampaignIds.has(a.campaign_id))
      : analyticsItems;

    // Step 4: Aggregate stats from active campaigns
    let totalSent = 0, totalOpens = 0, totalReplies = 0, totalOpportunities = 0, totalBounced = 0;
    let totalLeads = 0, totalCompleted = 0;

    for (const item of relevantAnalytics) {
      totalSent          += item.emails_sent_count    || 0;
      totalOpens         += item.open_count_unique    || 0;
      totalReplies       += item.reply_count_unique   || 0;
      totalOpportunities += item.total_opportunities  || 0;
      totalBounced       += item.bounced_count        || 0;
      totalLeads         += item.leads_count          || 0;
      totalCompleted     += item.completed_count      || 0;
    }

    // Step 5: Build campaigns list for display
    const campaigns = campaignsList.map(c => {
      const a = analyticsMap[c.id] || {};
      return {
        id: c.id,
        name: c.name,
        status: c.status === 1 ? 'active' : c.status === 2 ? 'paused' : c.status === 3 ? 'completed' : 'other',
        sent: a.emails_sent_count || 0,
        replies: a.reply_count_unique || 0,
        opportunities: a.total_opportunities || 0,
        leads_count: a.leads_count || 0,
        completed_count: a.completed_count || 0,
        contacted_count: a.contacted_count || 0,
        new_leads_contacted: a.new_leads_contacted_count || 0,
      };
    });

    // contacted_count from the API represents total email touches (not unique leads)
    // new_leads_contacted_count also appears inflated for multi-step campaigns
    // completed_count accurately matches Instantly's "Completed" metric
    // 
    // For lead consumption: leads_count is the total lead pool
    // The Instantly UI shows "Not yet contacted" = leads not yet entered in sequence
    // Best available proxy: contacted_count / leads_count gives a ratio but is inflated
    // 
    // We'll return all fields so the frontend can compute the best display

    const stats = {
      campaigns_count: activeCampaignIds.size,
      total_campaigns: campaignsList.length,
      total_sent: totalSent,
      total_opens: totalOpens,
      total_replies: totalReplies,
      total_opportunities: totalOpportunities,
      total_bounced: totalBounced,
      total_leads: totalLeads,
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
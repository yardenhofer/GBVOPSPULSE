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

// Fetch all pages of a paginated endpoint
async function fetchAllPages(path, apiKey) {
  let items = [];
  let startingAfter = null;
  while (true) {
    const url = startingAfter ? `${path}?limit=100&starting_after=${startingAfter}` : `${path}?limit=100`;
    const res = await fetchInstantly(url, apiKey);
    const page = Array.isArray(res) ? res : (res?.items || res?.data || []);
    items = items.concat(page);
    if (page.length < 100) break;
    startingAfter = page[page.length - 1]?.id || page[page.length - 1]?.campaign_id;
    if (!startingAfter) break;
  }
  return items;
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

    // Fetch campaign analytics (contains email metrics)
    const analyticsRes = await fetchInstantly('/campaigns/analytics?limit=100', apiKey);
    const allAnalytics = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes?.items || []);

    // Status 1 = Active
    const activeAnalytics = allAnalytics.filter(c => c.campaign_status === 1);

    let totalSent = 0, totalOpens = 0, totalReplies = 0, totalOpportunities = 0, totalBounced = 0;
    const activeCampaignIds = new Set();

    for (const item of activeAnalytics) {
      totalSent          += item.emails_sent_count   || 0;
      totalOpens         += item.open_count_unique   || 0;
      totalReplies       += item.reply_count_unique  || 0;
      totalOpportunities += item.total_opportunities || 0;
      totalBounced       += item.bounced_count       || 0;
      activeCampaignIds.add(item.campaign_id);
    }

    // Fetch campaign list to get lead counts (leads_count is on the campaign object)
    const campaignsRes = await fetchInstantly('/campaigns?limit=100', apiKey);
    const allCampaigns = Array.isArray(campaignsRes) ? campaignsRes : (campaignsRes?.items || campaignsRes?.data || []);
    // status 1 = Active
    const activeCampaigns = allCampaigns.filter(c => c.status === 1);

    // Build a map of campaign_id -> leads_count from the campaigns list
    const leadsCountMap = {};
    for (const c of activeCampaigns) {
      if (c.id) leadsCountMap[c.id] = c.leads_count || 0;
    }

    // Calculate total_leads and total_contacted for active campaigns only
    // "Contacted" = leads that have had sequence started (leads_count - not_yet_contacted)
    // We get not_yet_contacted from campaign analytics if available, otherwise use sent as proxy
    let totalLeads = 0;
    let totalContacted = 0;

    const campaigns = activeAnalytics.map(c => {
      // Get leads_count from campaigns list (more accurate)
      const leadsCount = leadsCountMap[c.campaign_id] ?? (c.leads_count || 0);
      // sequence_started_count is the number of leads that have been contacted
      const contacted = c.sequence_started_count || c.emails_sent_count || 0;
      totalLeads += leadsCount;
      totalContacted += contacted;
      return {
        id: c.campaign_id,
        name: c.campaign_name,
        status: c.campaign_status,
        sent: c.emails_sent_count || 0,
        replies: c.reply_count_unique || 0,
        opportunities: c.total_opportunities || 0,
        opportunity_value: c.total_opportunity_value || 0,
        leads_count: leadsCount,
        contacted: contacted,
      };
    });

    const stats = {
      campaigns_count: campaigns.length,
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
    };

    return Response.json({ stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
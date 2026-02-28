import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';

async function fetchInstantly(path, apiKey, options = {}) {
  const { method = 'GET', body } = options;
  const fetchOptions = {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  };
  if (body) fetchOptions.body = JSON.stringify(body);
  const res = await fetch(`${INSTANTLY_API}${path}`, fetchOptions);
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

    // Get per-campaign analytics
    const analyticsRes = await fetchInstantly('/campaigns/analytics', apiKey);
    const analyticsItems = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes?.items || []);

    // Filter active campaigns
    const activeAnalytics = analyticsItems.filter(a => a.campaign_status === 1);
    const hasActive = activeAnalytics.length > 0;
    const relevantAnalytics = hasActive ? activeAnalytics : analyticsItems;

    // For each active campaign, try POST /leads/list to find "not yet contacted" leads
    const campaignNotContacted = {};
    for (const a of relevantAnalytics) {
      // Try various filter approaches and log full response structure
      try {
        const res1 = await fetchInstantly('/leads/list', apiKey, {
          method: 'POST',
          body: {
            campaign_id: a.campaign_id,
            in_campaign_status: 'not_yet_contacted',
            limit: 1,
          }
        });
        console.log(`not_yet_contacted response keys: ${JSON.stringify(Object.keys(res1))}`);
        console.log(`not_yet_contacted full: ${JSON.stringify(res1).substring(0, 800)}`);
        if (res1.total_count != null) {
          campaignNotContacted[a.campaign_id] = res1.total_count;
        } else if (res1.items) {
          // If it filtered correctly but no total_count, we need another approach
          // Try with limit=0 or check if there's a count field
          console.log(`items length: ${res1.items?.length}, has next_starting_after: ${!!res1.next_starting_after}`);
        }
      } catch (e) {
        console.log(`not_yet_contacted error: ${e.message}`);
      }

      // Also try without filter to see what fields come back
      try {
        const res2 = await fetchInstantly('/leads/list', apiKey, {
          method: 'POST',
          body: {
            campaign_id: a.campaign_id,
            limit: 1,
          }
        });
        console.log(`All leads response keys: ${JSON.stringify(Object.keys(res2))}`);
        console.log(`All leads: total_count=${res2.total_count}, items_len=${res2.items?.length}`);
        // Check the lead status field - what does the first lead look like?
        if (res2.items?.[0]) {
          console.log(`Sample lead keys: ${JSON.stringify(Object.keys(res2.items[0]))}`);
          console.log(`Sample lead status: ${res2.items[0].status}, in_campaign_status: ${res2.items[0].in_campaign_status}`);
        }
      } catch (e) {
        console.log(`All leads error: ${e.message}`);
      }

      // From the screenshot: Total=20169, Not yet contacted=13164
      // The analytics API gives: leads_count=20169, contacted_count=233682 (inflated), new_leads_contacted_count=103511
      // None of these give 13164. Let's try: 20169 - (20106 in_progress) = 63... no
      // Or: leads_count - new_leads_contacted_count gives negative
      // The screenshot shows: In Progress=20106, Not yet contacted=13164, Total=20169
      // So In Progress + Not yet contacted > Total. This means "In Progress" counts leads currently in sequence
      // and "Not yet contacted" is separate pool. Total Leads = 20169 is just leads in the campaign
      // 
      // Looking at the analytics endpoint: contacted_count = "Number of leads for whom the sequence has started"
      // So not_yet_contacted should = leads_count - (contacted leads, deduplicated)
      // But contacted_count=233682 which is way more than leads_count=20169
      // This means contacted_count is NOT unique leads, despite the API docs saying so
      //
      // Let's compute: leads_count - new_leads_contacted_count... 20169 - 103511 = negative
      // 
      // The only reliable way is to use the leads list endpoint with the right filter
    }

    // Aggregate stats
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

    // Build campaigns list
    const campaigns = analyticsItems.map(a => ({
      id: a.campaign_id,
      name: a.campaign_name,
      status: a.campaign_status === 1 ? 'active' : a.campaign_status === 2 ? 'paused' : a.campaign_status === 3 ? 'completed' : 'other',
      sent: a.emails_sent_count || 0,
      replies: a.reply_count_unique || 0,
      opportunities: a.total_opportunities || 0,
      leads_count: a.leads_count || 0,
      completed_count: a.completed_count || 0,
      bounced_count: a.bounced_count || 0,
      unsubscribed_count: a.unsubscribed_count || 0,
      not_yet_contacted: campaignNotContacted[a.campaign_id] ?? null,
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
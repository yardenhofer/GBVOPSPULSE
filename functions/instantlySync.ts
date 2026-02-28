import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';

async function fetchInstantly(path, apiKey, options = {}) {
  const url = `${INSTANTLY_API}${path}`;
  console.log(`Fetching: ${url}`);
  const res = await fetch(url, {
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

    // Step 1: List all campaigns to get their IDs and statuses
    // GET /campaigns returns status as number: 0=Draft, 1=Active, 2=Paused, 3=Completed
    const campaignsRes = await fetchInstantly('/campaigns?limit=100', apiKey);
    const campaignsList = Array.isArray(campaignsRes) ? campaignsRes : (campaignsRes?.items || []);
    
    console.log(`Found ${campaignsList.length} campaigns`);
    console.log('Campaign statuses:', JSON.stringify(campaignsList.map(c => ({ name: c.name, status: c.status, id: c.id }))));

    // Step 2: Fetch analytics for all campaigns
    const analyticsRes = await fetchInstantly('/campaigns/analytics', apiKey);
    const analyticsItems = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes?.items || []);
    
    // Build a map of analytics by campaign_id
    const analyticsMap = {};
    for (const a of analyticsItems) {
      analyticsMap[a.campaign_id] = a;
    }

    // Step 3: Identify active campaigns (status === 1)
    const activeCampaignIds = new Set(
      campaignsList.filter(c => c.status === 1).map(c => c.id)
    );
    
    console.log(`Active campaign IDs: ${JSON.stringify([...activeCampaignIds])}`);

    // Step 4: For each active campaign, get its detailed summary to find lead breakdown
    // GET /campaigns/{id} should have more details
    const campaignDetails = [];
    for (const cId of activeCampaignIds) {
      try {
        const detail = await fetchInstantly(`/campaigns/${cId}`, apiKey);
        campaignDetails.push(detail);
        console.log(`Campaign detail for ${cId}:`, JSON.stringify({
          name: detail.name,
          status: detail.status,
          // Log any lead-related fields
          leads_count: detail.leads_count,
          leads_data: detail.leads_data,
          total_leads: detail.total_leads,
        }));
      } catch (e) {
        console.log(`Failed to fetch detail for campaign ${cId}: ${e.message}`);
      }
    }

    // Step 5: Build final data - only for active campaigns
    const hasActive = activeCampaignIds.size > 0;
    
    let totalSent = 0, totalOpens = 0, totalReplies = 0, totalOpportunities = 0, totalBounced = 0;
    let totalLeads = 0;

    // Process only active campaign analytics
    const relevantAnalytics = hasActive 
      ? analyticsItems.filter(a => activeCampaignIds.has(a.campaign_id))
      : analyticsItems;

    for (const item of relevantAnalytics) {
      totalSent          += item.emails_sent_count   || 0;
      totalOpens         += item.open_count_unique   || 0;
      totalReplies       += item.reply_count_unique  || 0;
      totalOpportunities += item.total_opportunities || 0;
      totalBounced       += item.bounced_count       || 0;
      totalLeads         += item.leads_count         || 0;
    }

    // For lead consumption: leads_count is the total leads in campaign
    // We need "sequence started" or "in progress + completed + not yet contacted" to figure out actual contacts
    // The analytics endpoint's emails_sent_count includes all steps/subsequences
    // So we fetch the campaign summary overview for better data
    
    // Try the analytics overview endpoint for per-campaign summary
    let overviewData = null;
    if (hasActive) {
      try {
        const campaignIdsParam = [...activeCampaignIds].join(',');
        overviewData = await fetchInstantly(`/campaigns/analytics/overview?campaign_ids=${campaignIdsParam}`, apiKey);
        console.log('Analytics overview:', JSON.stringify(overviewData));
      } catch (e) {
        console.log(`Analytics overview failed: ${e.message}`);
      }
    }

    // Use overview data if available for more accurate contacted count
    let totalContacted = 0;
    if (overviewData) {
      // Overview might have in_progress, completed, not_yet_contacted fields
      totalContacted = overviewData.in_progress || overviewData.completed || totalSent;
    }
    
    // If overview didn't give us contacted, estimate from leads_count
    // The campaign has leads_count total, and we know not_yet_contacted from Instantly's UI
    // Since we can't get not_yet_contacted from analytics, use leads_count - (leads not yet contacted)
    // For now, the best proxy: leads_count is total, and sequence_started or new_leads_contacted
    // If we have campaign detail with relevant info, use it
    if (!totalContacted || totalContacted === totalSent) {
      // Fallback: leads_count is total pool, contacted = total - not_yet_contacted
      // We don't have not_yet_contacted directly, but the campaign detail might
      // For now use a rough: contacted = min(emails_sent, leads_count) since each lead gets at least 1 email
      // But emails_sent includes follow-ups so it's inflated
      // Best available: leads_count is the pool, and the number of unique leads emailed is unknown from analytics alone
      // Let's use new_leads_contacted if available from overview
      totalContacted = 0; // Will be set below
    }

    // Build campaigns list for display
    const campaigns = campaignsList.map(c => {
      const analytics = analyticsMap[c.id];
      return {
        id: c.id,
        name: c.name,
        status: c.status === 1 ? 'active' : c.status === 2 ? 'paused' : c.status === 3 ? 'completed' : 'other',
        sent: analytics?.emails_sent_count || 0,
        replies: analytics?.reply_count_unique || 0,
        opportunities: analytics?.total_opportunities || 0,
        leads_count: analytics?.leads_count || 0,
        new_leads_contacted: analytics?.new_leads_contacted_count || null,
      };
    });

    // Log all analytics fields for the active campaign so we can see what's available
    for (const item of relevantAnalytics) {
      console.log(`Full analytics keys for campaign ${item.campaign_id}:`, JSON.stringify(Object.keys(item)));
      // Log specific lead-related fields
      const leadFields = {};
      for (const [k, v] of Object.entries(item)) {
        if (k.includes('lead') || k.includes('contact') || k.includes('progress') || k.includes('complet') || k.includes('sequence') || k.includes('not_yet')) {
          leadFields[k] = v;
        }
      }
      console.log(`Lead-related fields:`, JSON.stringify(leadFields));
    }

    // Figure out contacted: use new_leads_contacted_count if available, otherwise leads_count - approximate
    for (const item of relevantAnalytics) {
      if (item.new_leads_contacted_count !== undefined && item.new_leads_contacted_count !== null) {
        totalContacted += item.new_leads_contacted_count;
      } else if (item.leads_contacted_count !== undefined && item.leads_contacted_count !== null) {
        totalContacted += item.leads_contacted_count;
      }
    }

    // If we still have 0 contacted but have sent data, mark it as unavailable
    const contactedAvailable = totalContacted > 0;

    const stats = {
      campaigns_count: activeCampaignIds.size,
      total_campaigns: campaignsList.length,
      total_sent: totalSent,
      total_opens: totalOpens,
      total_replies: totalReplies,
      total_opportunities: totalOpportunities,
      total_bounced: totalBounced,
      total_leads: totalLeads,
      total_contacted: totalContacted,
      contacted_available: contactedAvailable,
      open_rate: totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0,
      reply_rate: totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0,
      last_synced: new Date().toISOString(),
      campaigns: campaigns.slice(0, 20),
      active_only: hasActive,
    };

    return Response.json({ stats });
  } catch (error) {
    console.error('Error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
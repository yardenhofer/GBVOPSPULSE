import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';

async function fetchInstantly(path, apiKey, method = 'GET', body = null) {
  const res = await fetch(`${INSTANTLY_API}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Instantly API error ${res.status}: ${text}`);
  }
  return res.json();
}

function getDateRange(period) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const end = fmt(now);
  if (period === 'today') return { start_date: end, end_date: end };
  if (period === '7d') {
    const start = new Date(now); start.setDate(start.getDate() - 6);
    return { start_date: fmt(start), end_date: end };
  }
  if (period === '30d') {
    const start = new Date(now); start.setDate(start.getDate() - 29);
    return { start_date: fmt(start), end_date: end };
  }
  return {};
}

// Count leads in a campaign by status using the leads/list endpoint
// Lead statuses: 1=Active, 2=Paused, 3=Completed, -1=Bounced, -2=Unsubscribed, -3=Skipped
async function getLeadCountsForCampaign(campaignId, apiKey) {
  try {
    // We use a limit of 1 just to get total count from the response — 
    // but Instantly doesn't return a total count in leads/list.
    // Instead we count by status using separate calls (Active vs non-Active).
    // Active = status 1 (not yet contacted / still queued)
    // "Contacted/used" = statuses 2, 3, -1, -2, -3

    // Fetch all leads for this campaign in batches (max 100 per page)
    let allLeads = [];
    let startingAfter = null;
    let hasMore = true;

    while (hasMore) {
      const payload = {
        campaign_id: campaignId,
        limit: 100,
      };
      if (startingAfter) payload.starting_after = startingAfter;

      const res = await fetchInstantly('/leads/list', apiKey, 'POST', payload);
      const leads = Array.isArray(res) ? res : (res?.items || res?.leads || []);
      allLeads = allLeads.concat(leads);

      // If we got less than 100, we're done
      if (leads.length < 100) {
        hasMore = false;
      } else {
        // Use last lead's id as cursor
        startingAfter = leads[leads.length - 1]?.id;
        if (!startingAfter) hasMore = false;
      }

      // Safety cap at 5000 leads to avoid long execution
      if (allLeads.length >= 5000) break;
    }

    const totalLeads = allLeads.length;
    // "Contacted" = anyone who has been reached: Completed(3), Bounced(-1), Unsubscribed(-2), Skipped(-3)
    // Also count Paused(2) as "in progress / contacted at least once"
    const contactedLeads = allLeads.filter(l => l.status !== 1).length;
    const activeLeads = allLeads.filter(l => l.status === 1).length;
    const completedLeads = allLeads.filter(l => l.status === 3).length;
    const bouncedLeads = allLeads.filter(l => l.status === -1).length;

    return { totalLeads, contactedLeads, activeLeads, completedLeads, bouncedLeads };
  } catch {
    // If lead fetching fails for this campaign, return nulls
    return { totalLeads: null, contactedLeads: null, activeLeads: null };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { client_id, period = 'all' } = body;

    const clients = await base44.entities.Client.filter({ id: client_id });
    const client = clients[0];
    if (!client) return Response.json({ error: 'Client not found' }, { status: 404 });

    const apiKey = client.instantly_api_key;
    if (!apiKey) return Response.json({ error: 'No Instantly API key configured for this client' }, { status: 400 });

    // Fetch analytics (for sent/opens/replies metrics, scoped to period)
    const dateRange = getDateRange(period);
    const qs = new URLSearchParams({ limit: '100' });
    if (dateRange.start_date) qs.set('start_date', dateRange.start_date);
    if (dateRange.end_date) qs.set('end_date', dateRange.end_date);

    const analyticsRes = await fetchInstantly(`/campaigns/analytics?${qs.toString()}`, apiKey);
    const items = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes?.items || []);

    let totalSent = 0, totalOpens = 0, totalReplies = 0, totalOpportunities = 0, totalBounced = 0;
    const campaignIds = [];

    const campaigns = items.map(c => {
      totalSent          += c.emails_sent_count   || 0;
      totalOpens         += c.open_count_unique   || 0;
      totalReplies       += c.reply_count_unique  || 0;
      totalOpportunities += c.total_opportunities || 0;
      totalBounced       += c.bounced_count       || 0;
      if (c.campaign_id) campaignIds.push(c.campaign_id);
      return {
        id: c.campaign_id,
        name: c.campaign_name,
        status: c.campaign_status,
        sent: c.emails_sent_count || 0,
        replies: c.reply_count_unique || 0,
        opportunities: c.total_opportunities || 0,
      };
    });

    // Fetch accurate lead counts per campaign (parallel, max 5 campaigns to keep response fast)
    let totalLeads = 0;
    let totalContacted = 0;
    let leadDataAvailable = false;

    const campaignsToFetch = campaignIds.slice(0, 5);
    if (campaignsToFetch.length > 0) {
      const leadResults = await Promise.all(
        campaignsToFetch.map(id => getLeadCountsForCampaign(id, apiKey))
      );

      for (const lr of leadResults) {
        if (lr.totalLeads !== null) {
          totalLeads += lr.totalLeads;
          totalContacted += lr.contactedLeads;
          leadDataAvailable = true;
        }
      }
    }

    const stats = {
      campaigns_count: campaigns.length,
      total_sent: totalSent,
      total_opens: totalOpens,
      total_replies: totalReplies,
      total_opportunities: totalOpportunities,
      total_bounced: totalBounced,
      // Lead consumption: accurate per-lead status counts
      total_leads: leadDataAvailable ? totalLeads : null,
      total_contacted: leadDataAvailable ? totalContacted : null,
      lead_data_available: leadDataAvailable,
      open_rate: totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0,
      reply_rate: totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0,
      period,
      last_synced: new Date().toISOString(),
      campaigns: campaigns.slice(0, 20),
    };

    return Response.json({ stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
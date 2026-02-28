import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';

async function fetchInstantly(path, apiKey) {
  const res = await fetch(`${INSTANTLY_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}` },
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

    // ── 1. Fetch analytics with date range (for sent/opens/replies metrics) ──
    const dateRange = getDateRange(period);
    const qs = new URLSearchParams({ limit: '100' });
    if (dateRange.start_date) qs.set('start_date', dateRange.start_date);
    if (dateRange.end_date) qs.set('end_date', dateRange.end_date);

    const analyticsRes = await fetchInstantly(`/campaigns/analytics?${qs.toString()}`, apiKey);
    const analyticsItems = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes?.items || []);

    // ── 2. Fetch ALL-TIME analytics (no date filter) for lead pool data ──
    // leads_count and emails_sent_count are all-time fields on the campaign itself,
    // not filtered by date — so we need unfiltered data for the lead pool calculation.
    const allTimeRes = await fetchInstantly(`/campaigns/analytics?limit=100`, apiKey);
    const allTimeItems = Array.isArray(allTimeRes) ? allTimeRes : (allTimeRes?.items || []);

    // Build a map of campaign_id -> all-time lead data
    const allTimeMap = {};
    for (const c of allTimeItems) {
      if (c.campaign_id) {
        allTimeMap[c.campaign_id] = {
          leads_count: c.leads_count || 0,         // total leads EVER added to the campaign
          contacted: c.contacted_count || c.emails_sent_count || 0, // leads that received at least 1 email
        };
      }
    }

    // ── 3. Aggregate period-scoped metrics ──
    let totalSent = 0, totalOpens = 0, totalReplies = 0, totalOpportunities = 0, totalBounced = 0;
    const campaigns = analyticsItems.map(c => {
      totalSent          += c.emails_sent_count   || 0;
      totalOpens         += c.open_count_unique   || 0;
      totalReplies       += c.reply_count_unique  || 0;
      totalOpportunities += c.total_opportunities || 0;
      totalBounced       += c.bounced_count       || 0;
      return {
        id: c.campaign_id,
        name: c.campaign_name,
        status: c.campaign_status,
        sent: c.emails_sent_count || 0,
        replies: c.reply_count_unique || 0,
      };
    });

    // ── 4. Lead pool consumption — from all-time data ──
    // leads_count  = total leads in the campaign (the "pool size")
    // contacted    = leads that have been emailed at least once
    // remaining    = leads_count - contacted  (leads NOT yet contacted = still in queue)
    let totalLeadsPool = 0;
    let totalContacted = 0;
    let leadDataAvailable = false;

    for (const data of Object.values(allTimeMap)) {
      if (data.leads_count > 0) {
        totalLeadsPool += data.leads_count;
        totalContacted += Math.min(data.contacted, data.leads_count); // cap at pool size
        leadDataAvailable = true;
      }
    }

    const remainingLeads = totalLeadsPool - totalContacted;
    const consumedPct = totalLeadsPool > 0
      ? Math.min(100, Math.round((totalContacted / totalLeadsPool) * 100))
      : null;

    const stats = {
      campaigns_count: campaigns.length,
      total_sent: totalSent,
      total_opens: totalOpens,
      total_replies: totalReplies,
      total_opportunities: totalOpportunities,
      total_bounced: totalBounced,
      // Lead pool (always all-time)
      total_leads: leadDataAvailable ? totalLeadsPool : null,
      total_contacted: leadDataAvailable ? totalContacted : null,
      remaining_leads: leadDataAvailable ? remainingLeads : null,
      consumed_pct: consumedPct,
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
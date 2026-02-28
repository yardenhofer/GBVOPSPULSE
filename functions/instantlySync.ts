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

    // ── 1. Fetch period-scoped analytics (for sent/opens/replies metrics) ──
    const dateRange = getDateRange(period);
    const qs = new URLSearchParams({ limit: '100' });
    if (dateRange.start_date) qs.set('start_date', dateRange.start_date);
    if (dateRange.end_date) qs.set('end_date', dateRange.end_date);

    const analyticsRes = await fetchInstantly(`/campaigns/analytics?${qs.toString()}`, apiKey);
    const analyticsItems = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes?.items || []);

    // ── 2. Fetch all-time analytics for lead pool data ──
    // analytics endpoint has leads_count & completed_count which we use for pool consumption
    const allTimeAnalyticsRes = await fetchInstantly(`/campaigns/analytics?limit=100`, apiKey);
    const allTimeItems = Array.isArray(allTimeAnalyticsRes) ? allTimeAnalyticsRes : (allTimeAnalyticsRes?.items || []);

    // ── 3. Aggregate period-scoped metrics from period analytics ──
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

    // ── 4. Lead pool consumption — from all-time analytics ──
    // leads_count = total leads uploaded to campaign
    // completed_count = leads that finished all sequence steps (fully contacted)
    // remaining = leads_count - completed_count
    let totalLeadsPool = 0;
    let totalCompleted = 0;
    let leadDataAvailable = false;
    const campaignBreakdown = [];

    for (const c of allTimeItems) {
      const totalLeads = c.leads_count || 0;
      if (totalLeads > 0) {
        leadDataAvailable = true;
        const completed = c.completed_count || 0;
        const remaining = Math.max(0, totalLeads - completed);
        const progressPct = Math.min(100, Math.round((completed / totalLeads) * 100));

        totalLeadsPool += totalLeads;
        totalCompleted += completed;

        campaignBreakdown.push({
          id: c.campaign_id,
          name: c.campaign_name,
          status: c.campaign_status,
          total_leads: totalLeads,
          not_yet_contacted: remaining,
          completed,
          progress_pct: progressPct,
        });
      }
    }

    const totalNotYetContacted = totalLeadsPool - totalCompleted;

    const totalContacted = totalLeadsPool - totalNotYetContacted;
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
      // Lead pool (always all-time, from campaign list endpoint)
      total_leads: leadDataAvailable ? totalLeadsPool : null,
      total_contacted: leadDataAvailable ? totalContacted : null,
      remaining_leads: leadDataAvailable ? totalNotYetContacted : null,
      consumed_pct: consumedPct,
      lead_data_available: leadDataAvailable,
      campaign_breakdown: campaignBreakdown, // per-campaign progress data
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
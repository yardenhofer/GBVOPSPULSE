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

function getDateRange(period) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const end = fmt(now);

  if (period === 'today') {
    return { start_date: end, end_date: end };
  } else if (period === '7d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { start_date: fmt(start), end_date: end };
  } else if (period === '30d') {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { start_date: fmt(start), end_date: end };
  }
  // 'all' — no date filter
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

    // Build query string for date filtering on the analytics endpoint
    const dateRange = getDateRange(period);
    const qs = new URLSearchParams();
    if (dateRange.start_date) qs.set('start_date', dateRange.start_date);
    if (dateRange.end_date) qs.set('end_date', dateRange.end_date);
    qs.set('limit', '100');

    const analyticsPath = `/campaigns/analytics?${qs.toString()}`;
    const analyticsRes = await fetchInstantly(analyticsPath, apiKey);
    const items = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes?.items || []);

    let totalSent = 0, totalOpens = 0, totalReplies = 0, totalOpportunities = 0, totalBounced = 0;
    let totalLeads = 0, totalContacted = 0;

    const campaigns = items.map(c => {
      totalSent          += c.emails_sent_count   || 0;
      totalOpens         += c.open_count_unique   || 0;
      totalReplies       += c.reply_count_unique  || 0;
      totalOpportunities += c.total_opportunities || 0;
      totalBounced       += c.bounced_count       || 0;
      // leads_count is total prospects ever added — not time-scoped, intentional for consumption %
      totalLeads         += c.leads_count         || 0;
      // contacted = unique leads that have received at least 1 email (all-time, from campaign)
      totalContacted     += c.contacted_count     || c.leads_count_contacted || 0;
      return {
        id: c.campaign_id,
        name: c.campaign_name,
        status: c.campaign_status,
        sent: c.emails_sent_count || 0,
        replies: c.reply_count_unique || 0,
        opportunities: c.total_opportunities || 0,
        leads_count: c.leads_count || 0,
        contacted_count: c.contacted_count || c.leads_count_contacted || 0,
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
      period,
      last_synced: new Date().toISOString(),
      campaigns: campaigns.slice(0, 20),
    };

    return Response.json({ stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
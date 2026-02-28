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

    // ── 2. Fetch campaign analytics (all-time) for lead counts ──
    // The /campaigns/analytics endpoint has leads_count and contacted/not-yet-contacted data
    const allTimeAnalyticsRes = await fetchInstantly(`/campaigns/analytics?limit=100`, apiKey);
    const allTimeItems = Array.isArray(allTimeAnalyticsRes) ? allTimeAnalyticsRes : (allTimeAnalyticsRes?.items || []);
    // DEBUG: return raw first item to inspect field names
    if (allTimeItems.length > 0) {
      return Response.json({ debug_analytics: allTimeItems[0] });
    }

    // Build map of campaign_id -> lead breakdown
    const campaignLeadMap = {};
    for (const c of campaignListItems) {
      const id = c.id || c.campaign_id;
      if (id) {
        campaignLeadMap[id] = {
          name: c.name || c.campaign_name,
          status: c.status || c.campaign_status,
          // These field names match what Instantly shows in their UI tooltip
          total_leads: c.leads_count || 0,
          not_yet_contacted: c.not_contacted_count ?? c.not_yet_contacted_count ?? null,
          completed: c.completed_count || 0,
          in_progress: c.in_progress_count || 0,
          bounced: c.bounced_count || 0,
          unsubscribed: c.unsubscribed_count || 0,
          progress_pct: c.progress ?? c.progress_pct ?? null,
        };
      }
    }

    // ── 3. Aggregate period-scoped metrics from analytics ──
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

    // ── 4. Lead pool consumption — from campaign list (all-time, per Instantly UI) ──
    // Sum across all active campaigns:
    //   total_leads = leads_count (the full pool)
    //   not_yet_contacted = leads not yet emailed (still in queue)
    //   contacted = total_leads - not_yet_contacted
    let totalLeadsPool = 0;
    let totalNotYetContacted = 0;
    let leadDataAvailable = false;
    const campaignBreakdown = [];

    for (const [id, data] of Object.entries(campaignLeadMap)) {
      if (data.total_leads > 0) {
        leadDataAvailable = true;
        totalLeadsPool += data.total_leads;

        // not_yet_contacted is the most reliable "remaining" metric
        // Fall back to total - completed if the field isn't present
        const notYet = data.not_yet_contacted !== null
          ? data.not_yet_contacted
          : Math.max(0, data.total_leads - data.completed);
        totalNotYetContacted += notYet;

        campaignBreakdown.push({
          id,
          name: data.name,
          status: data.status,
          total_leads: data.total_leads,
          not_yet_contacted: notYet,
          completed: data.completed,
          progress_pct: data.progress_pct !== null ? data.progress_pct : (
            data.total_leads > 0
              ? Math.round(((data.total_leads - notYet) / data.total_leads) * 100)
              : 0
          ),
        });
      }
    }

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
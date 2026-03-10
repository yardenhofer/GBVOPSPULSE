import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';

async function fetchInstantly(path, apiKey) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(`${INSTANTLY_API}${path}`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Instantly API error ${res.status}: ${text}`);
    }
    return res.json();
  } finally {
    clearTimeout(timeout);
  }
}

// Lightweight account health — only count statuses, don't store full objects
async function fetchAccountHealth(apiKey) {
  const counts = { total: 0, active: 0, paused: 0, errors: 0 };
  const errorAccounts = []; // only track error accounts (small list)
  let skip = 0;
  const limit = 100;
  const MAX_PAGES = 15; // cap at 1500 accounts
  let page = 0;
  while (page < MAX_PAGES) {
    const res = await fetchInstantly(`/accounts?limit=${limit}&skip=${skip}`, apiKey);
    const items = Array.isArray(res) ? res : (res?.items || []);
    for (const a of items) {
      counts.total++;
      if (a.status === 1) counts.active++;
      else if (a.status === 2) counts.paused++;
      else if (a.status < 0) {
        counts.errors++;
        if (errorAccounts.length < 20) {
          errorAccounts.push({
            email: a.email,
            status: a.status,
            status_label: a.status === -1 ? 'Connection Error' : a.status === -2 ? 'Soft Bounce Error' : a.status === -3 ? 'Sending Error' : 'Unknown',
          });
        }
      }
    }
    if (items.length < limit) break;
    skip += limit;
    page++;
  }
  counts.error_pct = counts.total > 0 ? Math.round((counts.errors / counts.total) * 100) : 0;
  return { ...counts, accounts: errorAccounts };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { client_id, time_filter } = body;

    let startDate = null;
    const now = new Date();
    if (time_filter === 'day') {
      startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString().split('T')[0];
    } else if (time_filter === 'week') {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      startDate = d.toISOString().split('T')[0];
    } else if (time_filter === 'month') {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      startDate = d.toISOString().split('T')[0];
    }

    const clients = await base44.entities.Client.filter({ id: client_id });
    const client = clients[0];
    if (!client) return Response.json({ error: 'Client not found' }, { status: 404 });

    const apiKey = client.instantly_api_key;
    if (!apiKey) return Response.json({ error: 'No Instantly API key configured for this client' }, { status: 400 });

    // Fetch campaigns, account health, and overview analytics in parallel
    const [campaignsRes, inboxHealth] = await Promise.all([
      fetchInstantly('/campaigns?limit=100', apiKey),
      fetchAccountHealth(apiKey),
    ]);

    const campaignsList = Array.isArray(campaignsRes) ? campaignsRes : (campaignsRes?.items || []);
    const activeCampaigns = campaignsList.filter(c => c.status === 1);

    // Get overview analytics + per-campaign analytics (for active campaigns only)
    const hasActive = activeCampaigns.length > 0;
    const overviewParams = [];
    if (startDate) overviewParams.push(`start_date=${startDate}`);
    if (hasActive) overviewParams.push('campaign_status=1');
    const overviewQuery = '/campaigns/analytics/overview' + (overviewParams.length ? '?' + overviewParams.join('&') : '');
    
    // Fetch overview and per-campaign analytics in parallel
    const [overviewRes, analyticsRes] = await Promise.all([
      fetchInstantly(overviewQuery, apiKey),
      fetchInstantly('/campaigns/analytics', apiKey),
    ]);

    // Build analytics lookup map
    const analyticsItems = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes?.items || []);
    const analyticsMap = {};
    for (const a of analyticsItems) analyticsMap[a.campaign_id] = a;

    const totalSent = overviewRes.emails_sent_count || 0;
    const totalOpens = overviewRes.open_count_unique || 0;
    const totalReplies = overviewRes.reply_count_unique || 0;
    const totalOpportunities = overviewRes.total_opportunities || 0;
    const totalBounced = overviewRes.bounced_count || 0;
    const totalLeads = overviewRes.leads_count || 0;
    const totalCompleted = overviewRes.completed_count || 0;

    // Build campaign list with per-campaign analytics
    const campaigns = campaignsList.slice(0, 20).map(c => {
      const a = analyticsMap[c.id] || {};
      return {
        id: c.id,
        name: c.name,
        status: c.status === 1 ? 'active' : c.status === 2 ? 'paused' : c.status === 3 ? 'completed' : 'other',
        leads_count: a.leads_count || 0,
        completed_count: a.completed_count || 0,
        sent: a.emails_sent_count || 0,
        replies: a.reply_count_unique || 0,
        opportunities: a.total_opportunities || 0,
      };
    });

    const stats = {
      campaigns_count: activeCampaigns.length,
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
      campaigns,
      active_only: hasActive,
      inbox_health: inboxHealth,
    };

    return Response.json({ stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
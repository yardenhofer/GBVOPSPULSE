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

async function fetchAllAccounts(apiKey) {
  let allAccounts = [];
  let skip = 0;
  const limit = 100;
  while (true) {
    const res = await fetchInstantly(`/accounts?limit=${limit}&skip=${skip}`, apiKey);
    const items = Array.isArray(res) ? res : (res?.items || []);
    allAccounts = allAccounts.concat(items);
    if (items.length < limit) break;
    skip += limit;
  }
  return allAccounts;
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

    // Fetch campaigns and email accounts in parallel
    const [campaignsRes, accounts] = await Promise.all([
      fetchInstantly('/campaigns?limit=100', apiKey),
      fetchAllAccounts(apiKey),
    ]);

    const campaignsList = Array.isArray(campaignsRes) ? campaignsRes : (campaignsRes?.items || []);
    const activeCampaignIds = new Set(campaignsList.filter(c => c.status === 1).map(c => c.id));

    // Email account health
    // Status: 1=Active, 2=Paused, 3=Maintenance, -1=Connection Error, -2=Soft Bounce, -3=Sending Error
    const totalAccounts = accounts.length;
    const activeAccounts = accounts.filter(a => a.status === 1).length;
    const pausedAccounts = accounts.filter(a => a.status === 2).length;
    const errorAccounts = accounts.filter(a => a.status < 0).length;
    const errorPct = totalAccounts > 0 ? Math.round((errorAccounts / totalAccounts) * 100) : 0;

    const accountsByStatus = accounts.map(a => ({
      email: a.email,
      status: a.status,
      status_label: a.status === 1 ? 'Active' : a.status === 2 ? 'Paused' : a.status === 3 ? 'Maintenance' : a.status === -1 ? 'Connection Error' : a.status === -2 ? 'Soft Bounce Error' : a.status === -3 ? 'Sending Error' : 'Unknown',
      warmup_status: a.warmup_status,
      daily_limit: a.daily_limit,
    }));

    // Get analytics
    const hasActive = activeCampaignIds.size > 0;
    let overviewParams = [];
    if (startDate) overviewParams.push(`start_date=${startDate}`);
    if (hasActive) overviewParams.push('campaign_status=1');
    const overviewQuery = '/campaigns/analytics/overview' + (overviewParams.length ? '?' + overviewParams.join('&') : '');
    const overviewRes = await fetchInstantly(overviewQuery, apiKey);

    const analyticsRes = await fetchInstantly('/campaigns/analytics', apiKey);
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
      // Email account health
      inbox_health: {
        total: totalAccounts,
        active: activeAccounts,
        paused: pausedAccounts,
        errors: errorAccounts,
        error_pct: errorPct,
        accounts: accountsByStatus,
      },
    };

    return Response.json({ stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
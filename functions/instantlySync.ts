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

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { client_id } = body;

    // Fetch the client record to get their specific Instantly API key
    const clients = await base44.entities.Client.filter({ id: client_id });
    const client = clients[0];
    if (!client) return Response.json({ error: 'Client not found' }, { status: 404 });

    const apiKey = client.instantly_api_key;
    if (!apiKey) return Response.json({ error: 'No Instantly API key configured for this client' }, { status: 400 });

    const analyticsRes = await fetchInstantly('/campaigns/analytics', apiKey);
    const items = Array.isArray(analyticsRes) ? analyticsRes : [];

    let totalSent = 0, totalOpens = 0, totalReplies = 0, totalOpportunities = 0, totalBounced = 0;
    for (const item of items) {
      totalSent          += item.emails_sent_count   || 0;
      totalOpens         += item.open_count_unique   || 0;
      totalReplies       += item.reply_count_unique  || 0;
      totalOpportunities += item.total_opportunities || 0;
      totalBounced       += item.bounced_count       || 0;
    }

    const campaigns = items.map(c => ({
      id: c.campaign_id,
      name: c.campaign_name,
      status: c.campaign_status,
      sent: c.emails_sent_count,
      replies: c.reply_count_unique,
      opportunities: c.total_opportunities,
      opportunity_value: c.total_opportunity_value,
    }));

    const stats = {
      campaigns_count: campaigns.length,
      total_sent: totalSent,
      total_opens: totalOpens,
      total_replies: totalReplies,
      total_opportunities: totalOpportunities,
      total_bounced: totalBounced,
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
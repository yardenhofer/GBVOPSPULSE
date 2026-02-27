import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';
const API_KEY = Deno.env.get('INSTANTLY_API_KEY');

async function fetchInstantly(path, options = {}) {
  const res = await fetch(`${INSTANTLY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
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

    // Get list of campaigns from Instantly (optionally filtered by client workspace)
    // Instantly V2 uses one API key per workspace, so all campaigns belong to this workspace
    // We'll aggregate stats across all campaigns for the given client
    // Each client maps to their own Instantly workspace via a separate API key stored per client,
    // but since we use a global key, we match by client name tag or just pull all.

    // Fetch campaigns overview analytics
    // GET /api/v2/campaigns/analytics — returns array of per-campaign stats (no id = all campaigns)
    const analyticsRes = await fetchInstantly('/campaigns/analytics');
    console.log('Analytics raw:', JSON.stringify(analyticsRes));

    const items = Array.isArray(analyticsRes) ? analyticsRes : [];

    let totalSent = 0, totalOpens = 0, totalReplies = 0, totalLeads = 0, totalMeetings = 0;
    for (const item of items) {
      totalSent    += item.emails_sent_count   || 0;
      totalOpens   += item.open_count          || 0;
      totalReplies += item.reply_count         || 0;
      totalLeads   += item.total_leads_count   || 0;
    }

    const campaigns = items.map(c => ({
      id: c.campaign_id,
      name: c.campaign_name,
      status: c.campaign_status,
    }));

    const stats = {
      campaigns_count: campaigns.length,
      total_sent: totalSent,
      total_opens: totalOpens,
      total_replies: totalReplies,
      total_leads: totalLeads,
      total_meetings: totalMeetings,
      open_rate: totalSent > 0 ? Math.round((totalOpens / totalSent) * 100) : 0,
      reply_rate: totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0,
      last_synced: new Date().toISOString(),
      campaigns: campaigns.slice(0, 20).map(c => ({
        id: c.id,
        name: c.name,
        status: c.status,
      })),
    };

    return Response.json({ stats, _debug: rawAnalytics });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
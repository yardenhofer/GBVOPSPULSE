import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';
const API_KEY = Deno.env.get('INSTANTLY_API_KEY');

async function fetchInstantly(path) {
  const res = await fetch(`${INSTANTLY_API}${path}`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
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
    const [campaignsRes, analyticsRes] = await Promise.all([
      fetchInstantly('/campaigns?limit=100'),
      fetchInstantly('/campaigns/analytics/overview'),
    ]);

    const campaigns = campaignsRes.items || [];

    // Build a map of campaign id -> name
    const campaignMap = {};
    for (const c of campaigns) {
      campaignMap[c.id] = c.name;
    }

    // Sum up stats
    let totalSent = 0, totalOpens = 0, totalReplies = 0, totalLeads = 0, totalMeetings = 0;

    const overviewItems = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes.items || []);
    for (const item of overviewItems) {
      totalSent += item.total_sent || 0;
      totalOpens += item.total_opened || 0;
      totalReplies += item.total_replied || 0;
      totalLeads += item.total_leads || 0;
      totalMeetings += item.total_meetings || 0;
    }

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

    return Response.json({ stats });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
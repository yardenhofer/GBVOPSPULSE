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
    const campaignsRes = await fetchInstantly('/campaigns?limit=100');
    const campaigns = campaignsRes.items || [];

    // Fetch per-campaign analytics using the correct V2 endpoint
    let totalSent = 0, totalOpens = 0, totalReplies = 0, totalLeads = 0, totalMeetings = 0;
    let rawAnalytics = null;

    if (campaigns.length > 0) {
      const campaignIds = campaigns.map(c => c.id);
      // Use the campaign analytics endpoint with campaign IDs
      const analyticsRes = await fetchInstantly('/analytics/campaign/summary', {
        method: 'POST',
        body: JSON.stringify({ campaign_ids: campaignIds }),
      });
      rawAnalytics = analyticsRes;
      console.log('Analytics raw response:', JSON.stringify(analyticsRes));

      const items = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes.data || analyticsRes.items || []);
      for (const item of items) {
        totalSent += item.emails_sent_count || item.total_sent || item.sent || 0;
        totalOpens += item.open_count || item.total_opened || item.opens || 0;
        totalReplies += item.reply_count || item.total_replied || item.replies || 0;
        totalLeads += item.lead_count || item.total_leads || item.leads || 0;
        totalMeetings += item.meeting_count || item.total_meetings || item.meetings || 0;
      }
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

    return Response.json({ stats, _debug: rawAnalytics });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
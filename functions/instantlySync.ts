import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';

// ── Helpers ────────────────────────────────────────────────────────────────────

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

/**
 * Paginate through an endpoint that uses cursor-based pagination.
 * Instantly v2 returns { items: [], next_cursor: "..." | null }
 */
async function fetchAllPages(basePath, apiKey, extraParams = {}) {
  const items = [];
  let cursor = null;

  do {
    const qs = new URLSearchParams({ limit: '100', ...extraParams });
    if (cursor) qs.set('starting_after', cursor);

    const data = await fetchInstantly(`${basePath}?${qs.toString()}`, apiKey);
    const page = Array.isArray(data) ? data : (data?.items ?? []);
    items.push(...page);

    cursor = data?.next_cursor ?? null;
  } while (cursor);

  return items;
}

function getDateRange(period) {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const end = fmt(now);

  if (period === 'today') return { start_date: end, end_date: end };
  if (period === '7d') {
    const s = new Date(now); s.setDate(s.getDate() - 6);
    return { start_date: fmt(s), end_date: end };
  }
  if (period === '30d') {
    const s = new Date(now); s.setDate(s.getDate() - 29);
    return { start_date: fmt(s), end_date: end };
  }
  return {}; // 'all' — no date filter
}

/**
 * Normalize lead counts from a campaign object.
 * Instantly v2 field names can vary slightly — we try all known variants.
 */
function extractLeadCounts(c) {
  const total        = c.leads_count          ?? c.total_leads           ?? 0;
  const completed    = c.completed_count      ?? c.contacted_leads_count  ?? 0;
  const notContacted = c.not_contacted_count  ?? c.not_yet_contacted_count
                     ?? c.uncontacted_leads_count
                     ?? (total > 0 ? Math.max(0, total - completed) : 0);
  const bounced      = c.bounced_count        ?? 0;
  const unsubscribed = c.unsubscribed_count   ?? 0;
  const inProgress   = c.in_progress_count   ?? 0;

  // Contacted = everyone who has received at least one email
  const contacted    = total - notContacted;

  // Progress % — prefer what Instantly sends, otherwise derive it
  const progressPct = c.progress != null
    ? Math.round(c.progress)
    : total > 0
      ? Math.min(100, Math.round((contacted / total) * 100))
      : 0;

  return { total, contacted, notContacted, completed, bounced, unsubscribed, inProgress, progressPct };
}

/**
 * Map Instantly numeric campaign status to a human-readable label.
 * 0 = Draft, 1 = Active, 2 = Paused, 3 = Completed
 */
function campaignStatusLabel(status) {
  return { 0: 'draft', 1: 'active', 2: 'paused', 3: 'completed' }[status] ?? 'unknown';
}

/**
 * Returns which stage of its journey a campaign is currently in.
 * Stages: imported → warming_up → sending → nearly_done → completed → paused
 */
function getCampaignStage(statusNum, leads) {
  const label = campaignStatusLabel(statusNum);
  if (label === 'draft')     return 'imported';
  if (label === 'paused')    return 'paused';
  if (label === 'completed') return 'completed';
  // Active campaigns
  if (leads.total === 0)         return 'imported';    // no leads loaded yet
  if (leads.contacted === 0)     return 'warming_up';  // leads loaded, not sent yet
  if (leads.progressPct >= 100)  return 'completed';
  if (leads.progressPct >= 80)   return 'nearly_done';
  return 'sending';
}

// ── Main handler ───────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { client_id, period = 'all', debug = false } = body;

    // ── Load client + API key ──────────────────────────────────────────────────
    const clients = await base44.entities.Client.filter({ id: client_id });
    const client  = clients[0];
    if (!client)  return Response.json({ error: 'Client not found' }, { status: 404 });

    const apiKey = client.instantly_api_key;
    if (!apiKey)  return Response.json({ error: 'No Instantly API key configured for this client' }, { status: 400 });

    // ── 1. Fetch ALL campaigns (no status filter) so the full journey is visible ──
    // Removing status=1 means draft, active, paused, and completed campaigns
    // all appear in the progression tracker.
    const allCampaigns = await fetchAllPages('/campaigns', apiKey);

    // Debug mode: return a raw sample to verify actual field names from Instantly
    if (debug) {
      return Response.json({
        debug: true,
        sample_campaign: allCampaigns[0] ?? null,
        total_fetched: allCampaigns.length,
        all_field_keys: allCampaigns[0] ? Object.keys(allCampaigns[0]) : [],
      });
    }

    // ── 2. Fetch period-scoped analytics (sent / opens / replies) ─────────────
    const dateRange       = getDateRange(period);
    const analyticsParams = { limit: '100' };
    if (dateRange.start_date) analyticsParams.start_date = dateRange.start_date;
    if (dateRange.end_date)   analyticsParams.end_date   = dateRange.end_date;

    const analyticsItems = await fetchAllPages('/campaigns/analytics', apiKey, analyticsParams);

    // Build a fast lookup: campaign_id → analytics row
    const analyticsMap = {};
    for (const row of analyticsItems) {
      const id = row.campaign_id ?? row.id;
      if (id) analyticsMap[id] = row;
    }

    // ── 3. Build enriched per-campaign objects ────────────────────────────────
    let totalSent = 0, totalOpens = 0, totalReplies = 0;
    let totalOpportunities = 0, totalBounced = 0;
    let totalLeadsPool = 0, totalContacted = 0, totalNotContacted = 0;

    const campaigns = allCampaigns.map(c => {
      const id        = c.id ?? c.campaign_id;
      const name      = c.name ?? c.campaign_name ?? 'Unnamed Campaign';
      const statusNum = c.status ?? c.campaign_status ?? 0;
      const leads     = extractLeadCounts(c);
      const analytics = analyticsMap[id] ?? {};

      const sent            = analytics.emails_sent_count  ?? 0;
      const opens           = analytics.open_count_unique  ?? 0;
      const replies         = analytics.reply_count_unique ?? 0;
      const opportunities   = analytics.total_opportunities ?? 0;
      const bouncedAnalytics = analytics.bounced_count     ?? 0;

      // Roll up aggregate totals
      totalSent          += sent;
      totalOpens         += opens;
      totalReplies       += replies;
      totalOpportunities += opportunities;
      totalBounced       += bouncedAnalytics;
      totalLeadsPool     += leads.total;
      totalContacted     += leads.contacted;
      totalNotContacted  += leads.notContacted;

      return {
        id,
        name,
        status:     campaignStatusLabel(statusNum),
        status_raw: statusNum,
        stage:      getCampaignStage(statusNum, leads),

        // Lead progression — all-time, sourced directly from campaign record
        leads: {
          total:         leads.total,
          contacted:     leads.contacted,
          not_contacted: leads.notContacted,
          completed:     leads.completed,
          in_progress:   leads.inProgress,
          bounced:       leads.bounced,
          unsubscribed:  leads.unsubscribed,
          progress_pct:  leads.progressPct,
        },

        // Sending metrics — period-scoped from analytics endpoint
        analytics: {
          sent,
          opens,
          replies,
          opportunities,
          bounced:    bouncedAnalytics,
          open_rate:  sent > 0 ? Math.round((opens   / sent) * 100) : 0,
          reply_rate: sent > 0 ? Math.round((replies / sent) * 100) : 0,
        },
      };
    });

    // Sort: active/sending first, completed last, then by progress % descending
    const stageOrder = { sending: 0, nearly_done: 1, warming_up: 2, imported: 3, paused: 4, completed: 5 };
    campaigns.sort((a, b) => {
      const stageDiff = (stageOrder[a.stage] ?? 9) - (stageOrder[b.stage] ?? 9);
      return stageDiff !== 0 ? stageDiff : b.leads.progress_pct - a.leads.progress_pct;
    });

    // ── 4. Build aggregate stats ───────────────────────────────────────────────
    const consumedPct = totalLeadsPool > 0
      ? Math.min(100, Math.round((totalContacted / totalLeadsPool) * 100))
      : null;

    const stats = {
      period,
      last_synced: new Date().toISOString(),

      // Sending metrics (period-scoped)
      campaigns_count:     campaigns.length,
      total_sent:          totalSent,
      total_opens:         totalOpens,
      total_replies:       totalReplies,
      total_opportunities: totalOpportunities,
      total_bounced:       totalBounced,
      open_rate:           totalSent > 0 ? Math.round((totalOpens   / totalSent) * 100) : 0,
      reply_rate:          totalSent > 0 ? Math.round((totalReplies / totalSent) * 100) : 0,

      // Lead pool consumption (all-time)
      total_leads:       totalLeadsPool,
      total_contacted:   totalContacted,
      remaining_leads:   totalNotContacted,
      consumed_pct:      consumedPct,

      // Stage breakdown — useful for dashboard summary cards
      stages: campaigns.reduce((acc, c) => {
        acc[c.stage] = (acc[c.stage] ?? 0) + 1;
        return acc;
      }, {}),

      // Full enriched campaign list with progression data
      campaigns,
    };

    return Response.json({ stats });

  } catch (error) {
    console.error('[instantly-analytics]', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
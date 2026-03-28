import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

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

async function syncOneClient(base44, client) {
  try {
    const apiKey = client.instantly_api_key;
    if (!apiKey) return;

    // Fetch campaigns and analytics in parallel
    const [campaignsRes, analyticsRes] = await Promise.all([
      fetchInstantly('/campaigns?limit=100', apiKey),
      fetchInstantly('/campaigns/analytics', apiKey),
    ]);

    const campaignsList = Array.isArray(campaignsRes) ? campaignsRes : (campaignsRes?.items || []);
    const activeCampaigns = campaignsList.filter(c => c.status === 1);
    const analyticsItems = Array.isArray(analyticsRes) ? analyticsRes : (analyticsRes?.items || []);

    let pct = 0;
    let noActive = false;

    if (activeCampaigns.length > 0) {
      const activeIds = new Set(activeCampaigns.map(c => c.id));
      let totalLeads = 0;
      let totalCompleted = 0;
      for (const a of analyticsItems) {
        if (activeIds.has(a.campaign_id)) {
          totalLeads += a.leads_count || 0;
          totalCompleted += a.completed_count || 0;
        }
      }
      pct = totalLeads > 0 ? Math.round((totalCompleted / totalLeads) * 100) : 0;
    } else {
      noActive = true;
    }

    await base44.asServiceRole.entities.Client.update(client.id, {
      instantly_cache_pct: pct,
      instantly_cache_no_active: noActive,
      instantly_cache_error: null,
      instantly_cache_updated: new Date().toISOString(),
    });

    return { id: client.id, name: client.name, pct, noActive };
  } catch (error) {
    await base44.asServiceRole.entities.Client.update(client.id, {
      instantly_cache_error: error.message,
      instantly_cache_updated: new Date().toISOString(),
    });
    return { id: client.id, name: client.name, error: error.message };
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow both scheduled (service role) and manual (admin) invocation
    const user = await base44.auth.me().catch(() => null);
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const allClientsRaw = await base44.asServiceRole.entities.Client.list('-updated_date', 200);
    const allClients = Array.isArray(allClientsRaw) ? allClientsRaw : (allClientsRaw?.items || allClientsRaw?.data || []);
    const instantlyClients = allClients.filter(c => c.instantly_api_key && c.status !== 'Terminated');

    const results = [];
    // Process in batches of 3 to avoid Instantly rate limits
    for (let i = 0; i < instantlyClients.length; i += 3) {
      const batch = instantlyClients.slice(i, i + 3);
      const batchResults = await Promise.all(batch.map(c => syncOneClient(base44, c)));
      results.push(...batchResults);
    }

    return Response.json({
      synced: results.length,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
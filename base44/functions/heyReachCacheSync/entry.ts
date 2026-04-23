import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PERIODS = [1, 7, 14, 30, 60, 90];
const API_BASE = "https://api.heyreach.io/api/public";

function apiHeaders() {
  const key = Deno.env.get("HEYREACH_INTERNAL_API_KEY");
  if (!key) throw new Error("HEYREACH_INTERNAL_API_KEY not set");
  return { "X-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json" };
}

async function fetchAllCampaigns() {
  const res = await fetch(`${API_BASE}/campaign/GetAll`, { method: "POST", headers: apiHeaders(), body: JSON.stringify({}) });
  if (!res.ok) throw new Error(`GetAll campaigns: HTTP ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

async function fetchAllLinkedInAccounts() {
  const allItems = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await fetch(`${API_BASE}/li_account/GetAll`, {
      method: "POST", headers: apiHeaders(),
      body: JSON.stringify({ Offset: offset, Limit: limit }),
    });
    if (!res.ok) break;
    const data = await res.json();
    const items = data.items || data || [];
    if (!Array.isArray(items) || items.length === 0) break;
    allItems.push(...items);
    if (items.length < limit) break;
    offset += limit;
  }
  return allItems;
}

async function fetchOverallStats(accountIds, campaignIds) {
  const res = await fetch(`${API_BASE}/stats/GetOverallStats`, {
    method: "POST", headers: apiHeaders(),
    body: JSON.stringify({ AccountIds: accountIds, CampaignIds: campaignIds }),
  });
  if (!res.ok) return null;
  return await res.json();
}

function buildWorkspaces(campaigns, senderAccounts, stats) {
  const senderMap = {};
  for (const s of senderAccounts) {
    senderMap[s.id] = {
      name: `${s.firstName || ""} ${s.lastName || ""}`.trim() || s.emailAddress || `Sender ${s.id}`,
      email: s.emailAddress || "",
    };
  }

  const workspaceMap = {};
  for (const camp of campaigns) {
    const wsId = camp.organizationUnitId || "__internal__";
    const isActive = (camp.status || "").toUpperCase() === "IN_PROGRESS";
    if (!workspaceMap[wsId]) {
      workspaceMap[wsId] = {
        client_id: String(wsId), client_name: "GBV Internal",
        accounts: {}, campaigns: [], dailyMap: {},
        summary: { total_accounts: 0, active_campaigns: 0, total_connections: 0, total_inmails: 0, total_in_progress: 0, total_leads: 0, finished_leads: 0 },
      };
    }
    const ws = workspaceMap[wsId];
    const totalLeads = camp.progressStats?.totalUsers || 0;
    const finishedLeads = camp.progressStats?.totalUsersFinished || 0;
    const inProgress = camp.progressStats?.totalUsersInProgress || 0;
    const senderIds = camp.campaignAccountIds || [];
    for (const sid of senderIds) {
      const info = senderMap[sid] || { name: `Sender ${sid}`, email: "" };
      if (!ws.accounts[sid]) {
        ws.accounts[sid] = { id: sid, name: info.name, email: info.email, connections: 0, inmails: 0, total_leads: 0, finished_leads: 0, in_progress: 0, completion_pct: 0 };
      }
      const div = senderIds.length || 1;
      ws.accounts[sid].total_leads += Math.round(totalLeads / div);
      ws.accounts[sid].finished_leads += Math.round(finishedLeads / div);
      ws.accounts[sid].in_progress += Math.round(inProgress / div);
    }
    if (isActive) {
      ws.campaigns.push({ id: camp.id, name: camp.name || "Unnamed", total_leads: totalLeads, finished_leads: finishedLeads, in_progress: inProgress, connections: 0, inmails: 0 });
      ws.summary.active_campaigns++;
    }
    ws.summary.total_in_progress += inProgress;
    ws.summary.total_leads += totalLeads;
    ws.summary.finished_leads += finishedLeads;
  }

  if (stats?.overallStats) {
    const os = stats.overallStats;
    for (const ws of Object.values(workspaceMap)) {
      ws.summary.total_connections = os.connectionsSent || 0;
      ws.summary.total_inmails = os.inmailMessagesSent || 0;
    }
  }
  if (stats?.byDayStats) {
    for (const [dateKey, dayStats] of Object.entries(stats.byDayStats)) {
      const date = dateKey.split("T")[0];
      for (const ws of Object.values(workspaceMap)) {
        if (!ws.dailyMap[date]) ws.dailyMap[date] = { date, connections: 0, inmails: 0, connectionsAccepted: 0 };
        ws.dailyMap[date].connections += dayStats.connectionsSent || 0;
        ws.dailyMap[date].inmails += dayStats.inmailMessagesSent || 0;
        ws.dailyMap[date].connectionsAccepted += dayStats.connectionsAccepted || 0;
      }
    }
  }

  return Object.values(workspaceMap).map(ws => {
    const accts = Object.values(ws.accounts).map(a => ({
      ...a, completion_pct: a.total_leads > 0 ? Math.round((a.finished_leads / a.total_leads) * 100) : 0,
    }));
    ws.summary.total_accounts = accts.length;
    const completionTotal = ws.summary.total_leads > 0 ? Math.round((ws.summary.finished_leads / ws.summary.total_leads) * 100) : 0;
    return { ...ws, accounts: accts, chartData: Object.values(ws.dailyMap).sort((a, b) => a.date.localeCompare(b.date)), dailyMap: undefined, summary: { ...ws.summary, completion_pct: completionTotal } };
  });
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  console.log(`[HEYREACH-SYNC] Starting cache sync for periods: ${PERIODS.join(", ")}`);

  // Fetch campaigns and accounts once (they don't change per period)
  const [campaigns, senderAccounts] = await Promise.all([
    fetchAllCampaigns(),
    fetchAllLinkedInAccounts(),
  ]);
  console.log(`[HEYREACH-SYNC] Fetched ${campaigns.length} campaigns, ${senderAccounts.length} accounts`);

  const allAccountIds = new Set();
  const allCampaignIds = [];
  for (const c of campaigns) {
    allCampaignIds.push(c.id);
    for (const aid of (c.campaignAccountIds || [])) allAccountIds.add(aid);
  }

  for (const days of PERIODS) {
    try {
      console.log(`[HEYREACH-SYNC] Building ${days}d stats...`);
      const now = new Date();
      const start = new Date(now.getTime() - days * 86400000).toISOString();
      const end = now.toISOString();

      // Fetch stats for this period
      const stats = await fetchOverallStats([...allAccountIds], allCampaignIds);
      const workspaces = buildWorkspaces(campaigns, senderAccounts, stats);

      if (workspaces.length === 0) {
        console.log(`[HEYREACH-SYNC] No workspaces for ${days}d, skipping`);
        continue;
      }

      // Delete old cache entries for this period, then write new ones
      const existing = await base44.asServiceRole.entities.HeyReachCache.filter({ days });
      for (const rec of existing) {
        await base44.asServiceRole.entities.HeyReachCache.delete(rec.id);
      }

      const syncedAt = now.toISOString();
      for (const ws of workspaces) {
        await base44.asServiceRole.entities.HeyReachCache.create({
          days,
          client_id: ws.client_id,
          client_name: ws.client_name,
          workspace_data: JSON.stringify(ws),
          synced_at: syncedAt,
        });
      }

      console.log(`[HEYREACH-SYNC] Cached ${workspaces.length} workspaces for ${days}d`);
    } catch (err) {
      console.error(`[HEYREACH-SYNC] Error syncing ${days}d: ${err.message}`);
    }
  }

  console.log(`[HEYREACH-SYNC] Cache sync complete`);
  return Response.json({ success: true });
});
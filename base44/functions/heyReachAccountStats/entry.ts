import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const API_BASE = "https://api.heyreach.io/api/public";

function headers() {
  const key = Deno.env.get("HEYREACH_INTERNAL_API_KEY");
  if (!key) throw new Error("HEYREACH_INTERNAL_API_KEY not set");
  return { "X-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json" };
}

async function fetchAllCampaigns() {
  const url = `${API_BASE}/campaign/GetAll`;
  const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify({}) });
  if (!res.ok) throw new Error(`GetAll campaigns: HTTP ${res.status}`);
  const data = await res.json();
  return data.items || [];
}

async function fetchAllLinkedInAccounts() {
  const url = `${API_BASE}/li_account/GetAll`;
  const allItems = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await fetch(url, {
      method: "POST",
      headers: headers(),
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
  console.log(`[HEYREACH] Fetched ${allItems.length} LinkedIn accounts across ${Math.ceil(allItems.length / limit) || 1} pages`);
  return allItems;
}

async function fetchOverallStats(accountIds, campaignIds, startDate, endDate) {
  const url = `${API_BASE}/stats/GetOverallStats`;
  const body = { AccountIds: accountIds, CampaignIds: campaignIds, StartDate: startDate, EndDate: endDate };
  const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) return null;
  return await res.json();
}

const BATCH_SIZE = 10;
async function fetchPerAccountStats(accountIds, start, end) {
  const statsMap = {};
  const ids = [...accountIds];
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (aid) => {
        const data = await fetchOverallStats([aid], [], start, end);
        return { id: aid, stats: data?.overallStats || null };
      })
    );
    for (const r of results) {
      if (r.stats) statsMap[r.id] = r.stats;
    }
  }
  return statsMap;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  // Auth: allow admin users and service-role calls (from heyReachCacheSync)
  try {
    const user = await base44.auth.me();
    if (user && user.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    // auth.me() throws when no user token (service-role call) — that's fine, allow it
  }

  const body = await req.json();
  const days = body.days || 1;
  const now = new Date();
  const start = body.startDate || new Date(now.getTime() - days * 86400000).toISOString();
  const end = body.endDate || now.toISOString();

  console.log(`[HEYREACH] Fetching stats for ${days}d window: ${start} → ${end}`);

  // Fetch campaigns and LinkedIn accounts in parallel
  const [campaigns, senderAccounts] = await Promise.all([
    fetchAllCampaigns(),
    fetchAllLinkedInAccounts(),
  ]);

  // Build sender lookup: id → { name, email }
  const senderMap = {};
  for (const s of senderAccounts) {
    senderMap[s.id] = {
      name: `${s.firstName || ""} ${s.lastName || ""}`.trim() || s.emailAddress || `Sender ${s.id}`,
      email: s.emailAddress || "",
    };
  }

  // Collect all unique account IDs used in campaigns
  const campaignAccountIds = new Set();
  for (const c of campaigns) {
    for (const aid of (c.campaignAccountIds || [])) campaignAccountIds.add(aid);
  }

  // Fetch global stats and per-account stats in parallel
  const [stats, perAccountStats] = await Promise.all([
    fetchOverallStats([], [], start, end),
    fetchPerAccountStats(campaignAccountIds, start, end),
  ]);

  console.log(`[HEYREACH] Per-account stats: ${Object.keys(perAccountStats).length}/${campaignAccountIds.size} accounts`);

  // Group campaigns by organizationUnitId (workspace)
  const workspaceMap = {};

  for (const camp of campaigns) {
    const wsId = camp.organizationUnitId || "__internal__";
    const isActive = (camp.status || "").toUpperCase() === "IN_PROGRESS";

    if (!workspaceMap[wsId]) {
      workspaceMap[wsId] = {
        client_id: String(wsId),
        client_name: "GBV Internal",
        accounts: {},
        campaigns: [],
        dailyMap: {},
        summary: { total_accounts: 0, active_campaigns: 0, total_connections: 0, total_inmails: 0, total_in_progress: 0, total_leads: 0, finished_leads: 0 },
      };
    }
    const ws = workspaceMap[wsId];

    const totalLeads = camp.progressStats?.totalUsers || 0;
    const finishedLeads = camp.progressStats?.totalUsersFinished || 0;
    const inProgress = camp.progressStats?.totalUsersInProgress || 0;

    // Track per-sender stats
    const senderIds = camp.campaignAccountIds || [];
    for (const sid of senderIds) {
      const info = senderMap[sid] || { name: `Sender ${sid}`, email: "" };
      if (!ws.accounts[sid]) {
        ws.accounts[sid] = { id: sid, name: info.name, email: info.email, connections: 0, inmails: 0, messages: 0, total_leads: 0, finished_leads: 0, in_progress: 0, completion_pct: 0 };
      }
      const div = senderIds.length || 1;
      ws.accounts[sid].total_leads += Math.round(totalLeads / div);
      ws.accounts[sid].finished_leads += Math.round(finishedLeads / div);
      ws.accounts[sid].in_progress += Math.round(inProgress / div);
    }

    if (isActive) {
      ws.campaigns.push({
        id: camp.id,
        name: camp.name || "Unnamed",
        total_leads: totalLeads,
        finished_leads: finishedLeads,
        in_progress: inProgress,
        connections: 0,
        inmails: 0,
      });
      ws.summary.active_campaigns++;
    }

    ws.summary.total_in_progress += inProgress;
    ws.summary.total_leads += totalLeads;
    ws.summary.finished_leads += finishedLeads;
  }

  // Apply per-account stats
  for (const ws of Object.values(workspaceMap)) {
    for (const [sid, acc] of Object.entries(ws.accounts)) {
      const as = perAccountStats[sid];
      if (as) {
        acc.connections = as.connectionsSent || 0;
        acc.inmails = as.totalInmailStarted || as.inmailMessagesSent || 0;
        acc.messages = as.totalMessageStarted || as.messagesSent || 0;
      }
    }
  }

  // Apply overall stats to workspace summaries
  if (stats?.overallStats) {
    const os = stats.overallStats;
    for (const ws of Object.values(workspaceMap)) {
      ws.summary.total_connections = os.connectionsSent || 0;
      ws.summary.total_inmails = os.totalInmailStarted || os.inmailMessagesSent || 0;
      ws.summary.total_messages = os.totalMessageStarted || os.messagesSent || 0;
      ws.summary.connections_accepted = os.connectionsAccepted || 0;
      ws.summary.total_inmail_replies = os.totalInmailReplies || 0;
      ws.summary.total_message_replies = os.totalMessageReplies || 0;
      ws.summary.profile_views = os.profileViews || 0;
    }
  }

  // Build chartData from byDayStats
  if (stats?.byDayStats) {
    for (const [dateKey, dayStats] of Object.entries(stats.byDayStats)) {
      const date = dateKey.split("T")[0];
      for (const ws of Object.values(workspaceMap)) {
        if (!ws.dailyMap[date]) ws.dailyMap[date] = { date, connections: 0, inmails: 0, connectionsAccepted: 0, messages: 0 };
        ws.dailyMap[date].connections += dayStats.connectionsSent || 0;
        ws.dailyMap[date].inmails += dayStats.totalInmailStarted || dayStats.inmailMessagesSent || 0;
        ws.dailyMap[date].connectionsAccepted += dayStats.connectionsAccepted || 0;
        ws.dailyMap[date].messages += dayStats.totalMessageStarted || dayStats.messagesSent || 0;
      }
    }
  }

  // Finalize workspaces
  const workspaces = Object.values(workspaceMap).map(ws => {
    const accts = Object.values(ws.accounts).map(a => ({
      ...a,
      completion_pct: a.total_leads > 0 ? Math.round((a.finished_leads / a.total_leads) * 100) : 0,
    }));
    ws.summary.total_accounts = accts.length;
    const completionTotal = ws.summary.total_leads > 0 ? Math.round((ws.summary.finished_leads / ws.summary.total_leads) * 100) : 0;

    return {
      ...ws,
      accounts: accts,
      chartData: Object.values(ws.dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
      dailyMap: undefined,
      summary: { ...ws.summary, completion_pct: completionTotal },
    };
  });

  // Debug: find campaign account IDs that aren't in the sender map
  const missingIds = [];
  for (const c of campaigns) {
    for (const aid of (c.campaignAccountIds || [])) {
      if (!senderMap[aid] && !missingIds.includes(aid)) missingIds.push(aid);
    }
  }
  if (missingIds.length > 0) {
    console.log(`[HEYREACH] WARNING: ${missingIds.length} campaign account IDs not found in li_account/GetAll: ${missingIds.slice(0, 20).join(", ")}`);
  }

  console.log(`[HEYREACH] Done: ${workspaces.length} workspaces, ${campaigns.length} campaigns, ${senderAccounts.length} senders`);
  return Response.json({ workspaces });
});
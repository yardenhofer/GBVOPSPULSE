import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const API_BASE = "https://api.heyreach.io/api/public";

// Short periods get per-account stats via chunked follow-up calls
const SHORT_PERIODS = [1, 7, 14];
const ACCOUNTS_PER_CHUNK = 40;

function apiHeaders() {
  const key = Deno.env.get("HEYREACH_INTERNAL_API_KEY");
  if (!key) throw new Error("HEYREACH_INTERNAL_API_KEY not set");
  return { "X-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json" };
}

async function fetchWithRetry(url, options, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if (res.status === 429) {
      const wait = attempt * 3000; // 3s, 6s, 9s backoff
      console.log(`[RETRY] ${label}: 429 rate limited, waiting ${wait / 1000}s (attempt ${attempt}/${maxRetries})`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 1000));
      continue;
    }
    throw new Error(`${label}: HTTP ${res.status}`);
  }
  throw new Error(`${label}: max retries exceeded`);
}

async function fetchAllCampaigns() {
  const res = await fetchWithRetry(
    `${API_BASE}/campaign/GetAll`,
    { method: "POST", headers: apiHeaders(), body: JSON.stringify({}) },
    "GetAll campaigns"
  );
  return (await res.json()).items || [];
}

async function fetchAllLinkedInAccounts() {
  const allItems = [];
  let offset = 0;
  while (true) {
    const res = await fetchWithRetry(
      `${API_BASE}/li_account/GetAll`,
      { method: "POST", headers: apiHeaders(), body: JSON.stringify({ Offset: offset, Limit: 100 }) },
      `GetAll li_accounts (offset ${offset})`
    );
    const data = await res.json();
    const items = data.items || data || [];
    if (!Array.isArray(items) || items.length === 0) break;
    allItems.push(...items);
    if (items.length < 100) break;
    offset += 100;
  }
  return allItems;
}

async function fetchOverallStats(startDate, endDate) {
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/stats/GetOverallStats`,
      { method: "POST", headers: apiHeaders(), body: JSON.stringify({ AccountIds: [], CampaignIds: [], StartDate: startDate, EndDate: endDate }) },
      "GetOverallStats"
    );
    return await res.json();
  } catch {
    return null;
  }
}

function buildWorkspaces(campaigns, senderAccounts, globalStats) {
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
        ws.accounts[sid] = { id: sid, name: info.name, email: info.email, connections: 0, inmails: 0, messages: 0, total_leads: 0, finished_leads: 0, in_progress: 0 };
      }
      const div = senderIds.length || 1;
      ws.accounts[sid].total_leads += Math.round(totalLeads / div);
      ws.accounts[sid].finished_leads += Math.round(finishedLeads / div);
      ws.accounts[sid].in_progress += Math.round(inProgress / div);
    }
    if (isActive) {
      ws.campaigns.push({ id: camp.id, name: camp.name || "Unnamed", total_leads: totalLeads, finished_leads: finishedLeads, in_progress: inProgress });
      ws.summary.active_campaigns++;
    }
    ws.summary.total_in_progress += inProgress;
    ws.summary.total_leads += totalLeads;
    ws.summary.finished_leads += finishedLeads;
  }

  if (globalStats?.overallStats) {
    const os = globalStats.overallStats;
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

  if (globalStats?.byDayStats) {
    for (const [dateKey, dayStats] of Object.entries(globalStats.byDayStats)) {
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

  return Object.values(workspaceMap).map(ws => {
    const accts = Object.values(ws.accounts).map(a => ({
      ...a, completion_pct: a.total_leads > 0 ? Math.round((a.finished_leads / a.total_leads) * 100) : 0,
    }));
    ws.summary.total_accounts = accts.length;
    ws.summary.completion_pct = ws.summary.total_leads > 0 ? Math.round((ws.summary.finished_leads / ws.summary.total_leads) * 100) : 0;
    return {
      ...ws, accounts: accts,
      chartData: Object.values(ws.dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
      dailyMap: undefined,
    };
  });
}

function trimWorkspaceData(ws) {
  const MAX_CHARS = 90000; // stay well under entity field limits
  
  // Always cap campaigns to 10
  if (ws.campaigns && ws.campaigns.length > 10) {
    ws.campaigns = ws.campaigns.slice(0, 10);
  }
  
  // Always cap chart data to last 90 entries
  if (ws.chartData && ws.chartData.length > 90) {
    ws.chartData = ws.chartData.slice(-90);
  }

  let json = JSON.stringify(ws);
  console.log(`[TRIM] ${ws.client_name}: ${json.length} chars, ${(ws.accounts || []).length} accounts, ${(ws.campaigns || []).length} campaigns`);

  // If still too big, truncate accounts
  if (json.length > MAX_CHARS && ws.accounts) {
    ws.accounts = [...ws.accounts]
      .sort((a, b) => (b.inmails + b.connections + b.total_leads) - (a.inmails + a.connections + a.total_leads))
      .slice(0, 80);
    json = JSON.stringify(ws);
  }
  
  if (json.length > MAX_CHARS && ws.accounts) {
    ws.accounts = ws.accounts.slice(0, 40);
    json = JSON.stringify(ws);
  }

  if (json.length > MAX_CHARS && ws.chartData) {
    ws.chartData = ws.chartData.slice(-14);
    json = JSON.stringify(ws);
  }
  
  if (json.length > MAX_CHARS && ws.campaigns) {
    ws.campaigns = ws.campaigns.slice(0, 3);
  }

  return ws;
}

Deno.serve(async (req) => {
  try {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const days = body.days;

  if (!days) return Response.json({ error: "Missing 'days' parameter" }, { status: 400 });

  console.log(`[SYNC-${days}d] Phase 1: fetching campaigns + global stats`);

  const [campaigns, senderAccounts] = await Promise.all([
    fetchAllCampaigns(),
    fetchAllLinkedInAccounts(),
  ]);
  console.log(`[SYNC-${days}d] ${campaigns.length} campaigns, ${senderAccounts.length} accounts`);

  const now = new Date();
  let start, end;
  if (days === 1) {
    const todayMidnight = new Date(now);
    todayMidnight.setUTCHours(0, 0, 0, 0);
    start = todayMidnight.toISOString();
    end = now.toISOString();
  } else {
    start = new Date(now.getTime() - days * 86400000).toISOString();
    end = now.toISOString();
  }

  const globalStats = await fetchOverallStats(start, end);
  const workspaces = buildWorkspaces(campaigns, senderAccounts, globalStats);

  // Save base workspace data (without per-account outreach stats)
  const existing = await base44.asServiceRole.entities.HeyReachCache.filter({ days });
  for (const rec of existing) {
    await base44.asServiceRole.entities.HeyReachCache.delete(rec.id);
  }

  const syncedAt = now.toISOString();
  for (const ws of workspaces) {
    const trimmed = trimWorkspaceData(ws);
    
    // Split: store summary/chart/campaigns in one record, accounts separately
    const summaryData = { ...trimmed, accounts: [] };
    const accountsData = trimmed.accounts || [];
    
    const summaryJson = JSON.stringify(summaryData);
    console.log(`[SYNC-${days}d] Summary size: ${summaryJson.length} chars, accounts: ${accountsData.length}`);
    
    await base44.asServiceRole.entities.HeyReachCache.create({
      days,
      client_id: trimmed.client_id,
      client_name: trimmed.client_name,
      workspace_data: summaryJson,
      synced_at: syncedAt,
    });
    
    // Store accounts in chunks if needed (max ~10KB per record to be safe)
    const ACCOUNTS_PER_RECORD = 50;
    for (let i = 0; i < accountsData.length; i += ACCOUNTS_PER_RECORD) {
      const chunk = accountsData.slice(i, i + ACCOUNTS_PER_RECORD);
      const chunkKey = `${trimmed.client_id}_accounts_${i}`;
      await base44.asServiceRole.entities.HeyReachCache.create({
        days,
        client_id: chunkKey,
        client_name: `${trimmed.client_name} (accounts ${i}-${i + chunk.length})`,
        workspace_data: JSON.stringify({ _type: "accounts_chunk", parent_client_id: trimmed.client_id, accounts: chunk }),
        synced_at: syncedAt,
      });
    }
  }
  console.log(`[SYNC-${days}d] Phase 1 done: saved ${workspaces.length} workspaces`);

  // Per-account enrichment is handled by the separate heyReachEnrichAccounts scheduler
  return Response.json({ success: true, workspaces: workspaces.length });
  } catch (err) {
    console.error(`[SYNC] Fatal error: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
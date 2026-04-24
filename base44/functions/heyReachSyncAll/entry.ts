import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const API_BASE = "https://api.heyreach.io/api/public";
const ALL_PERIODS = [1, 7, 14, 30, 60, 90];
const DELAY_BETWEEN_PERIODS = 3000; // 3s between each period's stats call
const ACCOUNTS_PER_CHUNK = 50;

function apiHeaders() {
  const key = Deno.env.get("HEYREACH_INTERNAL_API_KEY");
  if (!key) throw new Error("HEYREACH_INTERNAL_API_KEY not set");
  return { "X-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json" };
}

async function fetchWithRetry(url, options, label, maxRetries = 4) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if (res.status === 429) {
      const wait = attempt * 4000; // 4s, 8s, 12s, 16s backoff
      console.log(`[RETRY] ${label}: 429, waiting ${wait / 1000}s (attempt ${attempt}/${maxRetries})`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 2000));
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
    try {
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
      // Small delay between pagination calls
      await new Promise(r => setTimeout(r, 1000));
    } catch (err) {
      console.log(`[SYNC] li_account pagination stopped at offset ${offset}: ${err.message}. Got ${allItems.length} so far.`);
      break;
    }
  }
  return allItems;
}

async function fetchOverallStats(startDate, endDate, label) {
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/stats/GetOverallStats`,
      { method: "POST", headers: apiHeaders(), body: JSON.stringify({ AccountIds: [], CampaignIds: [], StartDate: startDate, EndDate: endDate }) },
      label
    );
    return await res.json();
  } catch (err) {
    console.log(`[SYNC] ${label} failed: ${err.message}`);
    return null;
  }
}

function buildWorkspace(campaigns, senderAccounts, globalStats) {
  const senderMap = {};
  for (const s of senderAccounts) {
    senderMap[s.id] = {
      name: `${s.firstName || ""} ${s.lastName || ""}`.trim() || s.emailAddress || `Sender ${s.id}`,
      email: s.emailAddress || "",
    };
  }

  const ws = {
    client_id: "__internal__", client_name: "GBV Internal",
    accounts: {}, campaigns: [], dailyMap: {},
    summary: { total_accounts: 0, active_campaigns: 0, total_connections: 0, total_inmails: 0, total_in_progress: 0, total_leads: 0, finished_leads: 0 },
  };

  for (const camp of campaigns) {
    const isActive = (camp.status || "").toUpperCase() === "IN_PROGRESS";
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

  // Apply global stats
  if (globalStats?.overallStats) {
    const os = globalStats.overallStats;
    ws.summary.total_connections = os.connectionsSent || 0;
    ws.summary.total_inmails = os.totalInmailStarted || os.inmailMessagesSent || 0;
    ws.summary.total_messages = os.totalMessageStarted || os.messagesSent || 0;
    ws.summary.connections_accepted = os.connectionsAccepted || 0;
    ws.summary.total_inmail_replies = os.totalInmailReplies || 0;
    ws.summary.total_message_replies = os.totalMessageReplies || 0;
    ws.summary.profile_views = os.profileViews || 0;
  }

  // Daily chart data
  if (globalStats?.byDayStats) {
    for (const [dateKey, dayStats] of Object.entries(globalStats.byDayStats)) {
      const date = dateKey.split("T")[0];
      if (!ws.dailyMap[date]) ws.dailyMap[date] = { date, connections: 0, inmails: 0, connectionsAccepted: 0, messages: 0 };
      ws.dailyMap[date].connections += dayStats.connectionsSent || 0;
      ws.dailyMap[date].inmails += dayStats.totalInmailStarted || dayStats.inmailMessagesSent || 0;
      ws.dailyMap[date].connectionsAccepted += dayStats.connectionsAccepted || 0;
      ws.dailyMap[date].messages += dayStats.totalMessageStarted || dayStats.messagesSent || 0;
    }
  }

  // Finalize
  const accts = Object.values(ws.accounts).map(a => ({
    ...a, completion_pct: a.total_leads > 0 ? Math.round((a.finished_leads / a.total_leads) * 100) : 0,
  }));
  ws.summary.total_accounts = accts.length;
  ws.summary.completion_pct = ws.summary.total_leads > 0 ? Math.round((ws.summary.finished_leads / ws.summary.total_leads) * 100) : 0;

  let chartData = Object.values(ws.dailyMap).sort((a, b) => a.date.localeCompare(b.date));
  if (chartData.length > 90) chartData = chartData.slice(-90);

  let campaignList = ws.campaigns;
  if (campaignList.length > 10) campaignList = campaignList.slice(0, 10);

  return { client_id: "88456", client_name: "GBV Internal", summary: ws.summary, accounts: accts, campaigns: campaignList, chartData };
}

function trimForStorage(wsData) {
  const MAX_CHARS = 90000;
  let json = JSON.stringify(wsData);
  if (json.length <= MAX_CHARS) return wsData;

  // Truncate accounts by activity
  if (wsData.accounts) {
    wsData.accounts = [...wsData.accounts]
      .sort((a, b) => (b.inmails + b.connections + b.total_leads) - (a.inmails + a.connections + a.total_leads))
      .slice(0, 80);
    json = JSON.stringify(wsData);
  }
  if (json.length > MAX_CHARS && wsData.chartData) {
    wsData.chartData = wsData.chartData.slice(-14);
  }
  return wsData;
}

async function savePeriod(base44, days, workspace, syncedAt) {
  // Load existing cache to preserve enriched per-account stats
  const existing = await base44.asServiceRole.entities.HeyReachCache.filter({ days });
  
  // Build a map of existing enriched account stats
  const enrichedStatsMap = {};
  for (const rec of existing) {
    if (!rec.workspace_data) continue;
    try {
      const parsed = JSON.parse(rec.workspace_data);
      if (parsed._type === "accounts_chunk") {
        for (const acc of (parsed.accounts || [])) {
          if (acc._enriched) {
            enrichedStatsMap[acc.id] = { connections: acc.connections, inmails: acc.inmails, messages: acc.messages };
          }
        }
      }
    } catch {}
  }

  // Merge enriched stats back into new workspace accounts
  const enrichedCount = Object.keys(enrichedStatsMap).length;
  if (enrichedCount > 0) {
    console.log(`[SYNC-ALL] Preserving enriched stats for ${enrichedCount} accounts (${days}d)`);
    for (const acc of (workspace.accounts || [])) {
      const es = enrichedStatsMap[acc.id];
      if (es) {
        acc.connections = es.connections;
        acc.inmails = es.inmails;
        acc.messages = es.messages;
        acc._enriched = true;
      }
    }
  }

  // Delete old records
  for (const rec of existing) {
    await base44.asServiceRole.entities.HeyReachCache.delete(rec.id);
  }

  // Save summary (without accounts)
  const summaryData = { ...workspace, accounts: [] };
  await base44.asServiceRole.entities.HeyReachCache.create({
    days,
    client_id: workspace.client_id,
    client_name: workspace.client_name,
    workspace_data: JSON.stringify(summaryData),
    synced_at: syncedAt,
  });

  // Save accounts in chunks
  const accounts = workspace.accounts || [];
  for (let i = 0; i < accounts.length; i += ACCOUNTS_PER_CHUNK) {
    const chunk = accounts.slice(i, i + ACCOUNTS_PER_CHUNK);
    await base44.asServiceRole.entities.HeyReachCache.create({
      days,
      client_id: `${workspace.client_id}_accounts_${i}`,
      client_name: `${workspace.client_name} (accounts ${i}-${i + chunk.length})`,
      workspace_data: JSON.stringify({ _type: "accounts_chunk", parent_client_id: workspace.client_id, accounts: chunk }),
      synced_at: syncedAt,
    });
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const now = new Date();
    const syncedAt = now.toISOString();

    // Phase 1: Fetch campaigns + accounts ONCE (shared across all periods)
    console.log(`[SYNC-ALL] Fetching campaigns + accounts...`);
    const campaigns = await fetchAllCampaigns();
    
    // Delay before next API call
    await new Promise(r => setTimeout(r, 2000));
    
    const senderAccounts = await fetchAllLinkedInAccounts();
    console.log(`[SYNC-ALL] ${campaigns.length} campaigns, ${senderAccounts.length} accounts`);

    // Phase 2: For each period sequentially, fetch stats and save
    for (const days of ALL_PERIODS) {
      // Delay between periods to avoid rate limits
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_PERIODS));

      const start = new Date(now.getTime() - days * 86400000).toISOString();
      const end = now.toISOString();

      console.log(`[SYNC-ALL] Fetching stats for ${days}d period...`);
      const globalStats = await fetchOverallStats(start, end, `GetOverallStats ${days}d`);
      
      const workspace = buildWorkspace(campaigns, senderAccounts, globalStats);
      const trimmed = trimForStorage(workspace);
      
      console.log(`[SYNC-ALL] Saving ${days}d: ${trimmed.accounts.length} accounts, ${trimmed.chartData.length} chart points`);
      await savePeriod(base44, days, trimmed, syncedAt);
    }

    console.log(`[SYNC-ALL] All periods saved`);
    return Response.json({ success: true, periods: ALL_PERIODS.length, campaigns: campaigns.length, accounts: senderAccounts.length });
  } catch (err) {
    console.error(`[SYNC-ALL] Fatal: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
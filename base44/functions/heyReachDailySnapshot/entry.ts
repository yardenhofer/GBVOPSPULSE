import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const API_BASE = "https://api.heyreach.io/api/public";

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
      const wait = attempt * 3000;
      console.log(`[SNAPSHOT] ${label}: 429, waiting ${wait / 1000}s (attempt ${attempt})`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (attempt < maxRetries) { await new Promise(r => setTimeout(r, 1500)); continue; }
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
      await new Promise(r => setTimeout(r, 800));
    } catch {
      break;
    }
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
  } catch (err) {
    console.log(`[SNAPSHOT] Stats failed: ${err.message}`);
    return null;
  }
}

async function fetchSingleAccountStats(aid, start, end) {
  try {
    const res = await fetchWithRetry(
      `${API_BASE}/stats/GetOverallStats`,
      { method: "POST", headers: apiHeaders(), body: JSON.stringify({ AccountIds: [aid], CampaignIds: [], StartDate: start, EndDate: end }) },
      `Account ${aid}`
    );
    const data = await res.json();
    return data?.overallStats || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const body = await req.json().catch(() => ({}));
    // Allow specifying a date, otherwise snapshot "today" (in UTC-5 / Colombia time)
    const now = new Date();
    // Colombia is UTC-5
    const colombiaOffset = -5 * 60 * 60 * 1000;
    const colombiaNow = new Date(now.getTime() + colombiaOffset);
    const dateStr = body.date || colombiaNow.toISOString().split('T')[0];

    // Check if snapshot already exists for this date
    const existing = await base44.asServiceRole.entities.HeyReachDailySnapshot.filter({ date: dateStr, snapshot_type: "summary" });
    if (existing.length > 0 && !body.force) {
      console.log(`[SNAPSHOT] Already exists for ${dateStr}, skipping (use force:true to override)`);
      return Response.json({ status: "already_exists", date: dateStr });
    }

    console.log(`[SNAPSHOT] Creating snapshot for ${dateStr}`);

    // Date range: full day in UTC
    const startDate = `${dateStr}T00:00:00.000Z`;
    const endDate = `${dateStr}T23:59:59.999Z`;

    // Fetch data
    const [campaigns, senderAccounts] = await Promise.all([
      fetchAllCampaigns(),
      fetchAllLinkedInAccounts(),
    ]);

    await new Promise(r => setTimeout(r, 2000));
    const globalStats = await fetchOverallStats(startDate, endDate);

    // Build per-account stats (batched)
    const campaignAccountIds = new Set();
    for (const c of campaigns) {
      for (const aid of (c.campaignAccountIds || [])) campaignAccountIds.add(aid);
    }

    const perAccountStats = {};
    const accountIdArr = [...campaignAccountIds];
    for (let i = 0; i < accountIdArr.length; i += 5) {
      const batch = accountIdArr.slice(i, i + 5);
      const results = await Promise.all(batch.map(aid => fetchSingleAccountStats(aid, startDate, endDate)));
      batch.forEach((aid, idx) => { if (results[idx]) perAccountStats[aid] = results[idx]; });
      if (i + 5 < accountIdArr.length) await new Promise(r => setTimeout(r, 400));
    }

    // Build workspace model (same logic as heyReachAccountStats)
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

    // Apply per-account and global stats
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
    if (globalStats?.overallStats) {
      const os = globalStats.overallStats;
      for (const ws of Object.values(workspaceMap)) {
        ws.summary.total_connections = os.connectionsSent || 0;
        ws.summary.total_inmails = os.totalInmailStarted || os.inmailMessagesSent || 0;
        ws.summary.total_messages = os.totalMessageStarted || os.messagesSent || 0;
        ws.summary.connections_accepted = os.connectionsAccepted || 0;
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

    // Finalize
    const workspaces = Object.values(workspaceMap).map(ws => {
      const accts = Object.values(ws.accounts).map(a => ({
        ...a, completion_pct: a.total_leads > 0 ? Math.round((a.finished_leads / a.total_leads) * 100) : 0,
      }));
      ws.summary.total_accounts = accts.length;
      ws.summary.completion_pct = ws.summary.total_leads > 0 ? Math.round((ws.summary.finished_leads / ws.summary.total_leads) * 100) : 0;
      return {
        ...ws,
        accounts: accts,
        chartData: Object.values(ws.dailyMap).sort((a, b) => a.date.localeCompare(b.date)),
        dailyMap: undefined,
      };
    }).sort((a, b) => (a.client_name || '').localeCompare(b.client_name || ''));

    // Delete any old snapshot records for this date
    if (existing.length > 0) {
      const allOld = await base44.asServiceRole.entities.HeyReachDailySnapshot.filter({ date: dateStr });
      for (const rec of allOld) {
        await base44.asServiceRole.entities.HeyReachDailySnapshot.delete(rec.id);
      }
    }

    // Store: summary with accounts stripped, then account chunks
    const allAccounts = [];
    const summaryWorkspaces = workspaces.map(ws => {
      allAccounts.push(...(ws.accounts || []).map(a => ({ ...a, _wsId: ws.client_id })));
      return { ...ws, accounts: [] };
    });

    await base44.asServiceRole.entities.HeyReachDailySnapshot.create({
      date: dateStr,
      snapshot_type: "summary",
      workspace_data: JSON.stringify(summaryWorkspaces),
    });

    // Store accounts in chunks of 50
    for (let i = 0; i < allAccounts.length; i += 50) {
      const chunk = allAccounts.slice(i, i + 50);
      await base44.asServiceRole.entities.HeyReachDailySnapshot.create({
        date: dateStr,
        snapshot_type: "accounts_chunk",
        chunk_index: Math.floor(i / 50),
        workspace_data: JSON.stringify(chunk),
      });
    }

    console.log(`[SNAPSHOT] Saved ${dateStr}: ${workspaces.length} workspaces, ${allAccounts.length} accounts`);
    return Response.json({ status: "success", date: dateStr, workspaces: workspaces.length, accounts: allAccounts.length });
  } catch (err) {
    console.error(`[SNAPSHOT] Error: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
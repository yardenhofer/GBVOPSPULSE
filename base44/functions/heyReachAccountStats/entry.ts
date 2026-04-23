import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const API_BASE = "https://api.heyreach.io/api/v1";

function headers() {
  const key = Deno.env.get("HEYREACH_INTERNAL_API_KEY");
  if (!key) throw new Error("HEYREACH_INTERNAL_API_KEY not set");
  return { "X-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json" };
}

async function fetchAllCampaigns(startDate, endDate) {
  const url = `${API_BASE}/campaign/ListAll`;
  const body = { Offset: 0, Limit: 500 };
  const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`ListAll campaigns: HTTP ${res.status}`);
  const data = await res.json();
  return data.Items || data.items || [];
}

async function fetchCampaignStats(campaignId, startDate, endDate) {
  const url = `${API_BASE}/campaign/${campaignId}/overall-stats?startDate=${startDate}&endDate=${endDate}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) return null;
  return await res.json();
}

async function fetchCampaignDailyStats(campaignId, startDate, endDate) {
  const url = `${API_BASE}/campaign/${campaignId}/daily-stats?startDate=${startDate}&endDate=${endDate}`;
  const res = await fetch(url, { headers: headers() });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

async function fetchAllSenderAccounts() {
  const url = `${API_BASE}/linkedin-account/ListAll`;
  const body = { Offset: 0, Limit: 500 };
  const res = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body) });
  if (!res.ok) return [];
  const data = await res.json();
  return data.Items || data.items || [];
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const days = body.days || 1;
  const now = new Date();
  const start = body.startDate || new Date(now.getTime() - days * 86400000).toISOString();
  const end = body.endDate || now.toISOString();

  console.log(`[HEYREACH] Fetching stats for ${days}d window: ${start} → ${end}`);

  // Fetch all campaigns and sender accounts
  const [campaigns, senderAccounts] = await Promise.all([
    fetchAllCampaigns(start, end),
    fetchAllSenderAccounts(),
  ]);

  // Build sender lookup
  const senderMap = {};
  for (const s of senderAccounts) {
    const id = s.Id || s.id;
    senderMap[id] = {
      name: `${s.FirstName || s.firstName || ""} ${s.LastName || s.lastName || ""}`.trim() || s.Email || s.email || `Sender ${id}`,
      email: s.Email || s.email,
    };
  }

  // Group campaigns by workspace (CallerListId / ListId)
  const workspaceMap = {};

  for (const camp of campaigns) {
    const campId = camp.Id || camp.id;
    const campName = camp.Name || camp.name || "Unnamed";
    const isActive = (camp.Status || camp.status || "").toLowerCase() === "active" || (camp.Status || camp.status) === 1;
    const wsId = camp.CallerListId || camp.callerListId || camp.ListId || camp.listId || "__internal__";
    const wsName = camp.CallerListName || camp.callerListName || camp.ListName || camp.listName || "GBV Internal";

    if (!workspaceMap[wsId]) {
      workspaceMap[wsId] = {
        client_id: String(wsId),
        client_name: wsName,
        accounts: {},
        campaigns: [],
        dailyMap: {},
        summary: { total_accounts: 0, active_campaigns: 0, total_connections: 0, total_inmails: 0, total_in_progress: 0, total_leads: 0, finished_leads: 0 },
      };
    }
    const ws = workspaceMap[wsId];

    // Fetch stats for this campaign
    const [stats, dailyStats] = await Promise.all([
      fetchCampaignStats(campId, start, end),
      fetchCampaignDailyStats(campId, start, end),
    ]);

    const connections = stats?.ConnectionRequestsSent || stats?.connectionRequestsSent || 0;
    const inmails = stats?.InMailsSent || stats?.inMailsSent || 0;
    const connectionsAccepted = stats?.ConnectionRequestsAccepted || stats?.connectionRequestsAccepted || 0;
    const totalLeads = stats?.TotalLeads || stats?.totalLeads || 0;
    const finishedLeads = stats?.FinishedLeads || stats?.finishedLeads || 0;
    const inProgress = stats?.InProgressLeads || stats?.inProgressLeads || 0;

    // Aggregate daily stats
    for (const d of dailyStats) {
      const date = (d.Date || d.date || "").split("T")[0];
      if (!date) continue;
      if (!ws.dailyMap[date]) ws.dailyMap[date] = { date, connections: 0, inmails: 0, connectionsAccepted: 0 };
      ws.dailyMap[date].connections += d.ConnectionRequestsSent || d.connectionRequestsSent || 0;
      ws.dailyMap[date].inmails += d.InMailsSent || d.inMailsSent || 0;
      ws.dailyMap[date].connectionsAccepted += d.ConnectionRequestsAccepted || d.connectionRequestsAccepted || 0;
    }

    // Track per-sender stats
    const senderIds = camp.LinkedInAccountIds || camp.linkedInAccountIds || [];
    for (const sid of senderIds) {
      const info = senderMap[sid] || { name: `Sender ${sid}`, email: "" };
      if (!ws.accounts[sid]) {
        ws.accounts[sid] = { id: sid, name: info.name, email: info.email, connections: 0, inmails: 0, total_leads: 0, finished_leads: 0, in_progress: 0, completion_pct: 0 };
      }
      // Divide campaign stats evenly among senders (approximation)
      const div = senderIds.length || 1;
      ws.accounts[sid].connections += Math.round(connections / div);
      ws.accounts[sid].inmails += Math.round(inmails / div);
      ws.accounts[sid].total_leads += Math.round(totalLeads / div);
      ws.accounts[sid].finished_leads += Math.round(finishedLeads / div);
      ws.accounts[sid].in_progress += Math.round(inProgress / div);
    }

    if (isActive) {
      ws.campaigns.push({
        id: campId,
        name: campName,
        total_leads: totalLeads,
        finished_leads: finishedLeads,
        in_progress: inProgress,
        connections,
        inmails,
      });
      ws.summary.active_campaigns++;
    }

    ws.summary.total_connections += connections;
    ws.summary.total_inmails += inmails;
    ws.summary.total_in_progress += inProgress;
    ws.summary.total_leads += totalLeads;
    ws.summary.finished_leads += finishedLeads;
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

  console.log(`[HEYREACH] Done: ${workspaces.length} workspaces, ${campaigns.length} campaigns`);
  return Response.json({ workspaces });
});
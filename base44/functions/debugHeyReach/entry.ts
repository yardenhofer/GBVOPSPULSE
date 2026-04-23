import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const API_BASE = "https://api.heyreach.io/api/public";

function headers() {
  const key = Deno.env.get("HEYREACH_INTERNAL_API_KEY");
  return { "X-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json" };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const body = await req.json();
  const action = body.action;

  if (action === "list_accounts") {
    // Get all accounts with pagination
    const allItems = [];
    let offset = 0;
    while (true) {
      const res = await fetch(`${API_BASE}/li_account/GetAll`, {
        method: "POST", headers: headers(),
        body: JSON.stringify({ Offset: offset, Limit: 100 }),
      });
      if (!res.ok) { allItems.push({ error: res.status, offset }); break; }
      const data = await res.json();
      const items = data.items || data || [];
      if (!Array.isArray(items) || items.length === 0) break;
      allItems.push(...items);
      if (items.length < 100) break;
      offset += 100;
    }
    // Return just id + name fields + all keys from first item
    const sampleKeys = allItems.length > 0 ? Object.keys(allItems[0]) : [];
    const summary = allItems.map(a => ({
      id: a.id,
      firstName: a.firstName,
      lastName: a.lastName,
      emailAddress: a.emailAddress,
      linkedInName: a.linkedInName,
      name: a.name,
      fullName: a.fullName,
    }));
    return Response.json({ total: allItems.length, sampleKeys, accounts: summary.slice(0, 20), allIds: allItems.map(a => a.id) });
  }

  if (action === "campaign_detail") {
    // Get first campaign and show all its keys + check for account info
    const res = await fetch(`${API_BASE}/campaign/GetAll`, {
      method: "POST", headers: headers(), body: JSON.stringify({})
    });
    if (!res.ok) return Response.json({ error: res.status });
    const data = await res.json();
    const camp = (data.items || [])[0];
    if (!camp) return Response.json({ error: "No campaigns" });
    return Response.json({ 
      keys: Object.keys(camp),
      campaignAccountIds: camp.campaignAccountIds,
      campaignAccounts: camp.campaignAccounts,
      senderAccounts: camp.senderAccounts,
      accounts: camp.accounts,
      sample: JSON.stringify(camp).substring(0, 4000)
    });
  }

  if (action === "single_account") {
    const accountId = body.accountId;
    const res = await fetch(`${API_BASE}/li_account/${accountId}`, { method: "GET", headers: headers() });
    if (!res.ok) return Response.json({ error: res.status, accountId });
    const data = await res.json();
    return Response.json({ keys: Object.keys(data), data });
  }

  if (action === "check_names") {
    // Directly call HeyReach APIs to check name coverage
    const [campaigns, accounts] = await Promise.all([
      (async () => {
        const res = await fetch(`${API_BASE}/campaign/GetAll`, { method: "POST", headers: headers(), body: JSON.stringify({}) });
        const data = await res.json();
        return data.items || [];
      })(),
      (async () => {
        const allItems = [];
        let offset = 0;
        while (true) {
          const res = await fetch(`${API_BASE}/li_account/GetAll`, {
            method: "POST", headers: headers(),
            body: JSON.stringify({ Offset: offset, Limit: 100 }),
          });
          if (!res.ok) break;
          const data = await res.json();
          const items = data.items || data || [];
          if (!Array.isArray(items) || items.length === 0) break;
          allItems.push(...items);
          if (items.length < 100) break;
          offset += 100;
        }
        return allItems;
      })(),
    ]);
    
    const accountMap = {};
    for (const a of accounts) accountMap[a.id] = `${a.firstName || ""} ${a.lastName || ""}`.trim();
    
    const campaignAccountIds = new Set();
    for (const c of campaigns) {
      for (const aid of (c.campaignAccountIds || [])) campaignAccountIds.add(aid);
    }
    
    const matched = [];
    const unmatched = [];
    for (const aid of campaignAccountIds) {
      if (accountMap[aid]) matched.push({ id: aid, name: accountMap[aid] });
      else unmatched.push(aid);
    }
    
    return Response.json({
      totalAccountsFromAPI: accounts.length,
      uniqueCampaignAccountIds: campaignAccountIds.size,
      matched: matched.length,
      unmatched: unmatched.length,
      unmatchedIds: unmatched,
    });
  }

  if (action === "test_stats") {
    const days = body.days || 7;
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400000).toISOString();
    const end = now.toISOString();
    
    // Fetch stats with dates
    const res = await fetch(`${API_BASE}/stats/GetOverallStats`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ AccountIds: [], CampaignIds: [], StartDate: start, EndDate: end }),
    });
    const data = await res.json();
    
    // Show top-level keys and overallStats, plus first few entries of byAccountStats if it exists
    return Response.json({ 
      status: res.status,
      topLevelKeys: Object.keys(data),
      overallStats: data.overallStats,
      byAccountStatsKeys: data.byAccountStats ? Object.keys(data.byAccountStats).slice(0, 5) : null,
      byAccountStatsSample: data.byAccountStats ? Object.entries(data.byAccountStats).slice(0, 3).map(([k,v]) => ({ accountId: k, stats: v })) : null,
      byCampaignStatsKeys: data.byCampaignStats ? Object.keys(data.byCampaignStats).slice(0, 5) : null,
      byCampaignStatsSample: data.byCampaignStats ? Object.entries(data.byCampaignStats).slice(0, 2).map(([k,v]) => ({ campaignId: k, stats: v })) : null,
      byDayStatsCount: data.byDayStats ? Object.keys(data.byDayStats).length : 0,
      dateRange: { start, end, days },
    });
  }

  if (action === "per_account_stats") {
    // Try fetching stats for a single account to see if byAccountStats appears
    const days = body.days || 7;
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400000).toISOString();
    const end = now.toISOString();
    const accountId = body.accountId;
    
    // Try with just one account ID
    const res = await fetch(`${API_BASE}/stats/GetOverallStats`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ AccountIds: accountId ? [accountId] : [], CampaignIds: [], StartDate: start, EndDate: end }),
    });
    const data = await res.json();
    
    // Also try the per-account endpoint if it exists
    let perAccountData = null;
    if (accountId) {
      const res2 = await fetch(`${API_BASE}/stats/GetAccountStats`, {
        method: "POST", headers: headers(),
        body: JSON.stringify({ AccountId: accountId, StartDate: start, EndDate: end }),
      });
      perAccountData = { status: res2.status, body: res2.ok ? await res2.json() : await res2.text() };
    }
    
    // Also check byDayStats structure when IDs are passed
    const byDaySample = data.byDayStats ? Object.entries(data.byDayStats).slice(0, 2).map(([k,v]) => ({ date: k, stats: v })) : null;
    
    return Response.json({ 
      topLevelKeys: Object.keys(data),
      overallStats: data.overallStats,
      byDaySample,
      byAccountStats: data.byAccountStats,
      perAccountEndpoint: perAccountData,
    });
  }

  if (action === "test_stats_with_ids") {
    const days = body.days || 7;
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400000).toISOString();
    const end = now.toISOString();
    
    // Fetch campaigns to get real account IDs
    const campRes = await fetch(`${API_BASE}/campaign/GetAll`, { method: "POST", headers: headers(), body: JSON.stringify({}) });
    const campData = await campRes.json();
    const campaigns = campData.items || [];
    const accountIds = new Set();
    const campaignIds = [];
    for (const c of campaigns) {
      campaignIds.push(c.id);
      for (const aid of (c.campaignAccountIds || [])) accountIds.add(aid);
    }
    
    // Test with real IDs
    const res1 = await fetch(`${API_BASE}/stats/GetOverallStats`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ AccountIds: [...accountIds], CampaignIds: campaignIds, StartDate: start, EndDate: end }),
    });
    const data1 = await res1.json();
    
    // Test with empty arrays
    const res2 = await fetch(`${API_BASE}/stats/GetOverallStats`, {
      method: "POST", headers: headers(),
      body: JSON.stringify({ AccountIds: [], CampaignIds: [], StartDate: start, EndDate: end }),
    });
    const data2 = await res2.json();
    
    return Response.json({
      withIds: { overall: data1.overallStats, byDayCount: Object.keys(data1.byDayStats || {}).length },
      withoutIds: { overall: data2.overallStats, byDayCount: Object.keys(data2.byDayStats || {}).length },
      idCounts: { accounts: accountIds.size, campaigns: campaignIds.length },
      sampleAccountIds: [...accountIds].slice(0, 5),
      sampleCampaignIds: campaignIds.slice(0, 5),
    });
  }

  if (action === "check_cache") {
    const d = body.days || 7;
    const records = await base44.asServiceRole.entities.HeyReachCache.filter({ days: d });
    const summaries = records.map(r => {
      const ws = JSON.parse(r.workspace_data);
      const acctSample = (ws.accounts || [])
        .filter(a => a.connections > 0 || a.inmails > 0 || (a.messages || 0) > 0)
        .slice(0, 5)
        .map(a => ({ name: a.name, connections: a.connections, inmails: a.inmails, messages: a.messages || 0 }));
      return { 
        client_name: ws.client_name, 
        summary: ws.summary, 
        chartDataCount: ws.chartData?.length || 0,
        chartSample: (ws.chartData || []).slice(0, 3),
        accountsCount: ws.accounts?.length || 0,
        accountsWithStats: (ws.accounts || []).filter(a => a.connections > 0 || a.inmails > 0).length,
        accountSample: acctSample,
      };
    });
    return Response.json({ period: d, records: records.length, summaries });
  }

  return Response.json({ error: "Unknown action" });
});
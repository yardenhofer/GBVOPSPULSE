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

  return Response.json({ error: "Unknown action" });
});
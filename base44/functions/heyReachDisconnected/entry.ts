import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const API_BASE = "https://api.heyreach.io/api/public";

function headers() {
  const key = Deno.env.get("HEYREACH_INTERNAL_API_KEY");
  if (!key) throw new Error("HEYREACH_INTERNAL_API_KEY not set");
  return { "X-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json" };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  try {
    const user = await base44.auth.me();
    if (user && user.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    // service-role call
  }

  const allItems = [];
  let offset = 0;
  const limit = 100;
  while (true) {
    const res = await fetch(`${API_BASE}/li_account/GetAll`, {
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

  const disconnected = allItems
    .filter(a => a.authIsValid === false)
    .map(a => ({
      id: a.id,
      name: `${a.firstName || ""} ${a.lastName || ""}`.trim() || a.emailAddress || `Account ${a.id}`,
      email: a.emailAddress || "",
      isActive: a.isActive,
      activeCampaigns: a.activeCampaigns || 0,
    }));

  return Response.json({ disconnected, total: allItems.length });
});
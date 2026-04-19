import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PAX8_TOKEN_URL = "https://api.pax8.com/v1/token";
const PAX8_API_BASE = "https://api.pax8.com/v1";

async function getPax8Token() {
  const clientId = Deno.env.get("PAX8_CLIENT_ID");
  const clientSecret = Deno.env.get("PAX8_CLIENT_SECRET");
  const res = await fetch(PAX8_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, audience: "https://api.pax8.com", grant_type: "client_credentials" }),
  });
  if (!res.ok) throw new Error(`Pax8 auth failed (${res.status})`);
  return (await res.json()).access_token;
}

async function pax8Get(token, path, params = {}) {
  const url = new URL(`${PAX8_API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  if (!res.ok) throw new Error(`GET ${path} failed (${res.status}): ${await res.text()}`);
  return res.json();
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") return Response.json({ error: "Forbidden" }, { status: 403 });

  const token = await getPax8Token();

  // Get all active companies
  const allCompanies = [];
  let page = 0;
  while (page < 10) {
    const data = await pax8Get(token, "/companies", { status: "Active", page, size: 200 });
    if (data.content) allCompanies.push(...data.content);
    if (page + 1 >= (data.page?.totalPages ?? 1)) break;
    page++;
  }

  const summary = [];
  for (const company of allCompanies) {
    let subs = [];
    try {
      const sData = await pax8Get(token, "/subscriptions", { companyId: company.id, size: 50 });
      subs = sData.content || [];
    } catch {}

    summary.push({
      name: company.name,
      id: company.id,
      bob: company.billOnBehalfOfEnabled ?? null,
      subCount: subs.length,
      subs: subs.map(s => ({
        status: s.status,
        startDate: s.startDate,
        price: s.price,
      })),
    });

    await new Promise(r => setTimeout(r, 200));
  }

  // Sort: companies with subs first, then alphabetical
  summary.sort((a, b) => b.subCount - a.subCount || a.name.localeCompare(b.name));

  return Response.json({
    total: summary.length,
    withSubs: summary.filter(r => r.subCount > 0).length,
    withoutSubs: summary.filter(r => r.subCount === 0).length,
    bobTrueCount: summary.filter(r => r.bob === true).length,
    companies: summary,
  });
});
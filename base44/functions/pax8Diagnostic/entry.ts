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

  const body = await req.json();
  const { action, companyNames } = body;

  // Fetch details for a batch of company names
  if (action === "fetchCompanyDetails") {
    if (!companyNames || !Array.isArray(companyNames)) return Response.json({ error: "companyNames required" });

    const token = await getPax8Token();

    // Get all active companies to find IDs
    const allCompanies = [];
    let page = 0;
    while (page < 10) {
      const data = await pax8Get(token, "/companies", { status: "Active", page, size: 200 });
      if (data.content) allCompanies.push(...data.content);
      if (page + 1 >= (data.page?.totalPages ?? 1)) break;
      page++;
    }

    // Also check for companies with subscriptions (like vault which already has one)
    // They might have a different status after ordering

    const results = [];
    for (const name of companyNames) {
      const match = allCompanies.find(c => c.name?.toLowerCase() === name.toLowerCase());
      if (!match) {
        // Try searching directly
        let searchMatch = null;
        try {
          const searchData = await pax8Get(token, "/companies", { filter: name, size: 5 });
          searchMatch = (searchData.content || []).find(c => c.name?.toLowerCase() === name.toLowerCase());
        } catch {}
        if (!searchMatch) {
          results.push({ companyName: name, error: "NOT FOUND in Pax8" });
          continue;
        }
      }

      const company = match || null;
      if (!company) { results.push({ companyName: name, error: "NOT FOUND" }); continue; }

      // Fetch full detail
      let detail;
      try { detail = await pax8Get(token, `/companies/${company.id}`); } catch (e) { detail = company; }

      // Fetch contacts
      let contacts = [];
      try {
        const cData = await pax8Get(token, `/companies/${company.id}/contacts`);
        contacts = cData.content || cData || [];
        if (!Array.isArray(contacts)) contacts = [];
      } catch {}

      // Fetch subscriptions
      let subs = [];
      try {
        const sData = await pax8Get(token, "/subscriptions", { companyId: company.id, size: 10 });
        subs = (sData.content || []).map(s => ({ id: s.id, productId: s.productId, status: s.status, quantity: s.quantity, billingTerm: s.billingTerm, startDate: s.startDate }));
      } catch {}

      results.push({
        companyName: name,
        companyId: company.id,
        pax8: {
          name: detail.name,
          status: detail.status,
          street: detail.address?.street || "",
          street2: detail.address?.street2 || "",
          city: detail.address?.city || "",
          state: detail.address?.stateOrProvince || "",
          postalCode: detail.address?.postalCode || "",
          country: detail.address?.country || "",
          phone: detail.phone || "",
          website: detail.website || "",
          billOnBehalfOfEnabled: detail.billOnBehalfOfEnabled,
          selfServiceAllowed: detail.selfServiceAllowed,
          orderApprovalRequired: detail.orderApprovalRequired,
          externalId: detail.externalId || null,
          allKeys: Object.keys(detail).sort(),
        },
        contacts: contacts.map(c => ({
          id: c.id,
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          phone: c.phone || "",
          phoneNumber: c.phoneNumber || "",
          types: c.types || [],
          hasAdminPrimary: (c.types || []).some(t => t.type === "Admin" && t.primary),
          hasBillingPrimary: (c.types || []).some(t => t.type === "Billing" && t.primary),
          hasTechnicalPrimary: (c.types || []).some(t => t.type === "Technical" && t.primary),
          allKeys: Object.keys(c).sort(),
        })),
        subscriptions: subs,
        subscriptionCount: subs.length,
      });

      await new Promise(r => setTimeout(r, 250));
    }

    return Response.json({ results });
  }

  // ── checkOrderStatus (fetch subscriptions for all active companies) ──
  if (action === "checkOrderStatus") {
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

    const results = [];
    for (const company of allCompanies) {
      let subs = [];
      try {
        const sData = await pax8Get(token, "/subscriptions", { companyId: company.id, size: 50 });
        subs = sData.content || [];
      } catch {}

      results.push({
        companyId: company.id,
        companyName: company.name,
        companyStatus: company.status,
        billOnBehalfOfEnabled: company.billOnBehalfOfEnabled,
        subscriptionCount: subs.length,
        subscriptions: subs.map(s => ({
          id: s.id,
          productId: s.productId,
          status: s.status,
          quantity: s.quantity,
          billingTerm: s.billingTerm,
          commitmentTermId: s.commitmentTermId,
          startDate: s.startDate,
          endDate: s.endDate,
          createdDate: s.createdDate,
          price: s.price,
        })),
      });

      await new Promise(r => setTimeout(r, 200));
    }

    const withSubs = results.filter(r => r.subscriptionCount > 0);
    const withoutSubs = results.filter(r => r.subscriptionCount === 0);

    return Response.json({
      totalCompanies: results.length,
      companiesWithSubscriptions: withSubs.length,
      companiesWithoutSubscriptions: withoutSubs.length,
      companies: results,
    });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
});
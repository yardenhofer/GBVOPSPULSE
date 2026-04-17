import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PAX8_TOKEN_URL = "https://api.pax8.com/v1/token";
const PAX8_API_BASE = "https://api.pax8.com/v1";
const TARGET_SKU = "MST-NCE-179-C100";
const SPEND_CAP = 250;
const BATCH_CAP = 100;

async function getPax8Token() {
  const clientId = Deno.env.get("PAX8_CLIENT_ID");
  const clientSecret = Deno.env.get("PAX8_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("PAX8_CLIENT_ID or PAX8_CLIENT_SECRET not set");

  const res = await fetch(PAX8_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      audience: "https://api.pax8.com",
      grant_type: "client_credentials",
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pax8 auth failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

async function pax8Get(token, path, params = {}) {
  const url = new URL(`${PAX8_API_BASE}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pax8 GET ${path} failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function pax8Post(token, path, body, queryParams = {}) {
  const url = new URL(`${PAX8_API_BASE}${path}`);
  Object.entries(queryParams).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = null; }
  return { ok: res.ok, status: res.status, data: json, text };
}

// Paginate through all results
async function pax8GetAll(token, path, params = {}, maxPages = 50) {
  const all = [];
  let page = 0;
  while (page < maxPages) {
    const data = await pax8Get(token, path, { ...params, page, size: 200 });
    if (data.content) all.push(...data.content);
    const totalPages = data.page?.totalPages ?? 1;
    page++;
    if (page >= totalPages) break;
  }
  return all;
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  // ── Action: resolveProduct ──
  if (action === "resolveProduct") {
    const token = await getPax8Token();
    // Search products by SKU
    const data = await pax8Get(token, "/products", { search: TARGET_SKU, size: 10 });
    const products = data.content || [];
    const match = products.find(p => p.sku === TARGET_SKU);
    if (!match) {
      return Response.json({ error: `Product with SKU ${TARGET_SKU} not found in Pax8 catalog.` });
    }
    return Response.json({
      productId: match.id,
      name: match.name,
      sku: match.sku,
      vendorName: match.vendorName,
      requiresCommitment: match.requiresCommitment,
    });
  }

  // ── Action: preflight ──
  if (action === "preflight") {
    const { productId } = body;
    if (!productId) return Response.json({ error: "productId required" });

    const token = await getPax8Token();

    // Get all active companies
    const companies = await pax8GetAll(token, "/companies", { status: "Active" });

    const eligible = [];
    const skipped = [];
    let alreadyHave = 0;

    // For each company, check if they already have a subscription for this product
    for (const company of companies) {
      if (eligible.length >= BATCH_CAP) {
        skipped.push({ companyId: company.id, companyName: company.name, reason: "Batch cap reached" });
        continue;
      }

      // Check existing subscriptions for this company+product
      let subs = [];
      try {
        const subData = await pax8Get(token, "/subscriptions", {
          companyId: company.id,
          productId: productId,
          size: 5,
        });
        subs = subData.content || [];
      } catch {
        // If subscriptions endpoint fails, skip
        skipped.push({ companyId: company.id, companyName: company.name, reason: "Could not check subscriptions" });
        continue;
      }

      const activeSubs = subs.filter(s => s.status === "Active" || s.status === "PendingActivation");
      if (activeSubs.length > 0) {
        alreadyHave++;
        skipped.push({ companyId: company.id, companyName: company.name, reason: "Already has active subscription" });
      } else {
        eligible.push({ companyId: company.id, companyName: company.name });
      }
    }

    return Response.json({
      totalCompanies: companies.length,
      eligible,
      skipped,
      alreadyHave,
    });
  }

  // ── Action: mockOrders ──
  if (action === "mockOrders") {
    const { productId, eligible } = body;
    if (!productId || !eligible) return Response.json({ error: "productId and eligible required" });

    const token = await getPax8Token();
    const mockResults = [];

    for (const client of eligible) {
      const orderPayload = {
        companyId: client.companyId,
        orderedBy: "Pax8 Partner",
        orderedByUserEmail: user.email,
        lineItems: [{
          productId,
          lineItemNumber: 1,
          quantity: 1,
          billingTerm: "Monthly",
          provisioningDetails: [],
        }],
      };

      const res = await pax8Post(token, "/orders", orderPayload, { isMock: "true" });

      mockResults.push({
        companyId: client.companyId,
        companyName: client.companyName,
        status: res.ok ? "mock_success" : "mock_failed",
        error: res.ok ? null : (res.data?.message || res.text || `HTTP ${res.status}`),
        response: res.data,
      });
    }

    return Response.json({ mockResults });
  }

  // ── Action: placeOrder (LIVE — single client) ──
  if (action === "placeOrder") {
    const { productId, companyId, companyName, runId } = body;
    if (!productId || !companyId) return Response.json({ error: "productId and companyId required" });

    const token = await getPax8Token();

    const orderPayload = {
      companyId,
      orderedBy: "Pax8 Partner",
      orderedByUserEmail: user.email,
      lineItems: [{
        productId,
        lineItemNumber: 1,
        quantity: 1,
        billingTerm: "Monthly",
        provisioningDetails: [],
      }],
    };

    // LIVE order — no isMock flag
    const res = await pax8Post(token, "/orders", orderPayload);

    if (res.ok) {
      console.log(`[LIVE ORDER] Success for ${companyName} (${companyId}), order ID: ${res.data?.id}`);
      return Response.json({
        status: "success",
        orderId: res.data?.id,
        response: res.data,
      });
    } else {
      console.error(`[LIVE ORDER] Failed for ${companyName} (${companyId}): ${res.text}`);
      return Response.json({
        status: "failed",
        reason: res.data?.message || res.text || `HTTP ${res.status}`,
        response: res.data,
      });
    }
  }

  // ── Action: debug — structured investigation, no trial-and-error ──
  if (action === "debug") {
    const { productId, step, subscriptionId } = body;
    if (!productId && step !== "fetchSubscription") return Response.json({ error: "productId required" });
    const token = await getPax8Token();

    // Step 1: GET /v1/products/{productId}/provision-details
    if (step === "provisionDetails") {
      const url = `${PAX8_API_BASE}/products/${productId}/provision-details`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const data = await res.json();
      const items = data.content || [];
      const pg = body.pg || 0;
      // Return 3 items at a time to avoid truncation
      const chunk = items.slice(pg * 3, (pg + 1) * 3);
      return Response.json({
        total: items.length,
        pg,
        showing: `${pg * 3}-${Math.min((pg + 1) * 3, items.length)} of ${items.length}`,
        keys: items.map(i => i.key),
        chunk,
      });
    }

    // Step 3: GET /v1/subscriptions/{subscriptionId} — fetch a single subscription's full detail
    if (step === "fetchSubscription") {
      if (!subscriptionId) return Response.json({ error: "subscriptionId required" });
      const url = `${PAX8_API_BASE}/subscriptions/${subscriptionId}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const rawText = await res.text();
      return new Response(rawText, {
        status: res.status,
        headers: { "Content-Type": res.headers.get("Content-Type") || "application/json" },
      });
    }

    // Step 3 helper: find an existing NCE subscription to inspect
    if (step === "findExistingSubscription") {
      // Look across active companies for any subscription to this product (or similar NCE)
      const companies = await pax8GetAll(token, "/companies", { status: "Active" });
      for (const company of companies) {
        let subData;
        try {
          subData = await pax8Get(token, "/subscriptions", {
            companyId: company.id,
            productId: productId,
            size: 5,
          });
        } catch { continue; }
        const subs = subData.content || [];
        if (subs.length > 0) {
          // Return the first subscription ID we find + its list-level data
          return Response.json({
            found: true,
            companyId: company.id,
            companyName: company.name,
            subscriptionSummary: subs[0],
            subscriptionId: subs[0].id,
            allSubIds: subs.map(s => ({ id: s.id, status: s.status })),
          });
        }
      }
      return Response.json({ found: false, companiesSearched: companies.length });
    }

    return Response.json({ error: "Provide step: provisionDetails | fetchSubscription | findExistingSubscription" });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
});
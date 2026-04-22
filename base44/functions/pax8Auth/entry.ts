import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PAX8_TOKEN_URL = "https://api.pax8.com/v1/token";
const PAX8_API_BASE = "https://api.pax8.com/v1";
const TARGET_SKU = "MST-NCE-179-C100";
const PRODUCT_ID = "b2286d6e-4d50-40b5-b60b-b7dce26bf423";
const COMMITMENT_TERM_ID = "c5bab94b-9eb4-4646-a737-bcf0f0ea8f87";
const SPEND_CAP = 250;
const BATCH_CAP = 100;
const DOMAIN_RETRY_LIMIT = 5;
const ORDERED_BY_EMAIL = "leon@nitroclosing.com";
const CANCEL_POLICY_ACK = "I understand, and acknowledge that I will have a 7 calendar day window to cancel my subscription, or make quantity decrements before I am no longer able to make these changes. Once a subscription is locked, I will be required fulfill my elected commitment term of my subscription.";
const SKIP_DOMAINS = ["growbigventures.com", "nitroclosing.com"];

const STATIC_PROVISIONING = [
  { key: "msCustExists", values: ["No, the customer does not have a Microsoft account"] },
  { key: "msMPNidval", values: ["7100033"] },
  { key: "mca2020FirstName", values: ["Leon"] },
  { key: "mca2020LastName", values: ["Blom"] },
  { key: "mca2020Email", values: ["leon@nitroclosing.com"] },
  { key: "msftContactFirstName", values: ["Leon"] },
  { key: "msftContactLastName", values: ["Blom"] },
  { key: "msftContactEmail", values: ["leon@nitroclosing.com"] },
  { key: "microsoftCancelPolicyAcknowledgement", values: [CANCEL_POLICY_ACK] },
];

async function getPax8Token() {
  const clientId = Deno.env.get("PAX8_CLIENT_ID");
  const clientSecret = Deno.env.get("PAX8_CLIENT_SECRET");
  if (!clientId || !clientSecret) throw new Error("PAX8_CLIENT_ID or PAX8_CLIENT_SECRET not set");

  const res = await fetch(PAX8_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
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

// ── Domain counter helpers ──
async function getDomainCounter(base44) {
  const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: "pax8_domain_counter" });
  if (settings.length > 0) return parseInt(settings[0].value, 10);
  return 3; // default
}

async function setDomainCounter(base44, newVal) {
  const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: "pax8_domain_counter" });
  if (settings.length > 0) {
    await base44.asServiceRole.entities.AppSettings.update(settings[0].id, { value: String(newVal) });
  } else {
    await base44.asServiceRole.entities.AppSettings.create({ key: "pax8_domain_counter", value: String(newVal) });
  }
}

// ── Build order payload ──
function buildOrderPayload(companyId, domainN) {
  return {
    companyId,
    orderedBy: "Pax8 Partner",
    orderedByUserEmail: ORDERED_BY_EMAIL,
    lineItems: [{
      productId: PRODUCT_ID,
      quantity: 1,
      billingTerm: "Monthly",
      commitmentTermId: COMMITMENT_TERM_ID,
      provisioningDetails: [
        { key: "msCustExists", values: ["No, the customer does not have a Microsoft account"] },
        { key: "msDomain", values: [`GrowBig${domainN}`] },
        ...STATIC_PROVISIONING.filter(p => p.key !== "msCustExists"),
      ],
    }],
  };
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  // ── resolveProduct ──
  if (action === "resolveProduct") {
    const token = await getPax8Token();
    const data = await pax8Get(token, "/products", { search: TARGET_SKU, size: 10 });
    const products = data.content || [];
    const match = products.find(p => p.sku === TARGET_SKU);
    if (!match) return Response.json({ error: `Product with SKU ${TARGET_SKU} not found.` });
    return Response.json({
      productId: match.id,
      name: match.name,
      sku: match.sku,
      vendorName: match.vendorName,
      commitmentTermId: COMMITMENT_TERM_ID,
    });
  }

  // ── preflight ──
  if (action === "preflight") {
    const token = await getPax8Token();
    const companies = await pax8GetAll(token, "/companies", { status: "Active" });
    const eligible = [];
    const skipped = [];
    let alreadyHave = 0;

    for (const company of companies) {
      if (eligible.length >= BATCH_CAP) {
        skipped.push({ companyId: company.id, companyName: company.name, reason: "Batch cap reached" });
        continue;
      }
      let subs = [];
      try {
        const subData = await pax8Get(token, "/subscriptions", { companyId: company.id, productId: PRODUCT_ID, size: 5 });
        subs = subData.content || [];
      } catch {
        skipped.push({ companyId: company.id, companyName: company.name, reason: "Could not check subscriptions" });
        continue;
      }
      const activeSubs = subs.filter(s => s.status === "Active" || s.status === "PendingActivation");
      // Extract domain from company website, email, or fall back to name
      let domain = "";
      if (company.website) {
        domain = company.website.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
      } else if (company.email) {
        domain = company.email.split("@")[1] || "";
      }
      if (!domain) domain = company.name || "unknown";
      if (SKIP_DOMAINS.some(d => domain.toLowerCase().includes(d))) {
        skipped.push({ companyId: company.id, companyName: company.name, domain, reason: "Protected domain (always skipped)" });
        continue;
      }
      if (activeSubs.length > 0) {
        alreadyHave++;
        skipped.push({ companyId: company.id, companyName: company.name, domain, reason: "Already has active subscription" });
      } else {
        eligible.push({ companyId: company.id, companyName: company.name, domain });
      }
    }

    const currentCounter = await getDomainCounter(base44);
    return Response.json({ totalCompanies: companies.length, eligible, skipped, alreadyHave, currentDomainCounter: currentCounter });
  }

  // ── validateContacts (check contacts for a list of companies) ──
  if (action === "validateContacts") {
    const { companies } = body;
    if (!companies || !Array.isArray(companies)) return Response.json({ error: "companies array required" });

    const token = await getPax8Token();
    const results = [];

    for (const company of companies) {
      let contacts = [];
      let error = null;
      try {
        const data = await pax8Get(token, `/companies/${company.companyId}/contacts`);
        contacts = data.content || data || [];
        if (!Array.isArray(contacts)) contacts = [];
      } catch (e) {
        error = e.message;
      }

      const requiredTypes = ["Admin", "Billing", "Technical"];
      const missing = [];
      for (const type of requiredTypes) {
        const hasPrimary = contacts.some(c =>
          c.types && c.types.some(t => t.type === type && t.primary === true)
        );
        if (!hasPrimary) missing.push(type);
      }

      results.push({
        companyId: company.companyId,
        companyName: company.companyName,
        contactCount: contacts.length,
        contacts: contacts.map(c => ({
          firstName: c.firstName,
          lastName: c.lastName,
          email: c.email,
          types: c.types,
        })),
        missingPrimaryTypes: missing,
        valid: missing.length === 0,
        error,
      });

      // Small delay to avoid rate limits
      if (companies.indexOf(company) < companies.length - 1) {
        await new Promise(r => setTimeout(r, 300));
      }
    }

    const validCount = results.filter(r => r.valid).length;
    const invalidCount = results.filter(r => !r.valid).length;

    return Response.json({ results, validCount, invalidCount, total: results.length });
  }

  // ── mockOrder (single client test) ──
  if (action === "mockOrder") {
    const { companyId, companyName } = body;
    if (!companyId) return Response.json({ error: "companyId required" });

    const token = await getPax8Token();
    const currentN = await getDomainCounter(base44);
    const payload = buildOrderPayload(companyId, currentN);

    console.log("[MOCK] Sending payload:", JSON.stringify(payload, null, 2));

    const startMs = Date.now();
    const res = await pax8Post(token, "/orders", payload, { isMock: "true" });
    const elapsedMs = Date.now() - startMs;

    // Log full untruncated response to audit
    await base44.asServiceRole.entities.Pax8AuditLog.create({
      run_id: `mock_${Date.now()}`,
      triggered_by: user.email,
      mode: "mock",
      status: res.ok ? "completed" : "error",
      product_id: PRODUCT_ID,
      product_name: "Exchange Online (Plan 1) [NCE]",
      product_sku: TARGET_SKU,
      eligible_count: 1,
      success_count: res.ok ? 1 : 0,
      failed_count: res.ok ? 0 : 1,
      eligible_clients: JSON.stringify([{ companyId, companyName }]),
      results: JSON.stringify([{
        companyId,
        companyName,
        status: res.ok ? "mock_success" : "mock_failed",
        httpStatus: res.status,
        elapsedMs,
        domainUsed: `GrowBig${currentN}`,
      }]),
      api_log: JSON.stringify([{
        request: { ...payload, _note: "credentials redacted" },
        response: res.data,
        rawText: res.text,
        httpStatus: res.status,
        elapsedMs,
      }]),
      error_message: res.ok ? null : (res.data?.message || res.text),
    });

    return Response.json({
      ok: res.ok,
      httpStatus: res.status,
      elapsedMs,
      domainUsed: `GrowBig${currentN}`,
      payloadSent: payload,
      fullResponse: res.data,
      rawText: res.text,
    });
  }

  // ── mockOrders (batch mock) ──
  if (action === "mockOrders") {
    const { eligible } = body;
    if (!eligible) return Response.json({ error: "eligible required" });

    const token = await getPax8Token();
    let currentN = await getDomainCounter(base44);
    const mockResults = [];

    for (const client of eligible) {
      let succeeded = false;
      let lastError = null;
      let domainUsed = currentN;

      // Retry up to DOMAIN_RETRY_LIMIT times on domain collision (same logic as live orders)
      for (let attempt = 0; attempt < DOMAIN_RETRY_LIMIT; attempt++) {
        domainUsed = currentN;
        const payload = buildOrderPayload(client.companyId, currentN);
        const res = await pax8Post(token, "/orders", payload, { isMock: "true" });

        if (res.ok) {
          mockResults.push({
            companyId: client.companyId,
            companyName: client.companyName,
            status: "mock_success",
            domainUsed: `GrowBig${currentN}`,
            error: null,
            response: res.data,
          });
          currentN++;
          succeeded = true;
          break;
        }

        // Check if domain collision — retry with next number
        const errText = (res.data?.message || res.text || "").toLowerCase();
        const detailsText = JSON.stringify(res.data?.details || []).toLowerCase();
        const combined = errText + " " + detailsText;
        const isDomainCollision = combined.includes("domain") && (combined.includes("taken") || combined.includes("exists") || combined.includes("already") || combined.includes("unavailable") || combined.includes("invalid") || combined.includes("not available"));

        if (isDomainCollision) {
          console.log(`[MOCK] Domain GrowBig${currentN} collision for ${client.companyName}, retrying...`);
          currentN++;
          lastError = res.data?.message || res.text || `HTTP ${res.status}`;
          continue;
        }

        // Non-domain error — fail immediately
        lastError = res.data?.message || res.text || `HTTP ${res.status}`;
        currentN++;
        break;
      }

      if (!succeeded) {
        mockResults.push({
          companyId: client.companyId,
          companyName: client.companyName,
          status: "mock_failed",
          domainUsed: `GrowBig${domainUsed}`,
          error: lastError,
          response: null,
        });
      }
    }

    // Persist counter so next run starts from where we left off
    await setDomainCounter(base44, currentN);

    return Response.json({ mockResults });
  }

  // ── placeOrder (LIVE — single client with domain retry) ──
  if (action === "placeOrder") {
    const { companyId, companyName, runId, maxDomainRetries, workspaceId, workspaceName, sendingDomain: explicitDomain } = body;
    if (!companyId) return Response.json({ error: "companyId required" });

    const token = await getPax8Token();
    let currentN = await getDomainCounter(base44);
    const retryLimit = maxDomainRetries || DOMAIN_RETRY_LIMIT;

    for (let attempt = 0; attempt < retryLimit; attempt++) {
      const domainN = currentN + attempt;
      const payload = buildOrderPayload(companyId, domainN);

      console.log(`[LIVE ORDER] Attempt ${attempt + 1} for ${companyName} with GrowBig${domainN}`);
      const res = await pax8Post(token, "/orders", payload);

      if (res.ok) {
        // Success — increment counter past this domain
        await setDomainCounter(base44, domainN + 1);
        console.log(`[LIVE ORDER] Success for ${companyName}, order ID: ${res.data?.id}, domain: GrowBig${domainN}`);

        // Use explicit sending domain from CSV if provided, otherwise derive from company name
        const sendingDomain = explicitDomain || (companyName.toLowerCase().replace(/[^a-z0-9]/g, "") + ".info");
        const tenantData = {
          pax8_company_id: companyId,
          pax8_company_name: companyName,
          sending_domain: sendingDomain,
          ms_domain: `GrowBig${domainN}`,
          overall_status: "ordered",
        };
        if (workspaceId) {
          tenantData.instantly_workspace_id = workspaceId;
          tenantData.instantly_workspace_name = workspaceName || null;
          tenantData.instantly_upload_status = "pending";
        }
        const tenantRecord = await base44.asServiceRole.entities.TenantLifecycle.create(tenantData);
        console.log(`[LIVE ORDER] Created TenantLifecycle ${tenantRecord.id} for ${companyName}`);

        return Response.json({
          status: "success",
          orderId: res.data?.id,
          domainUsed: `GrowBig${domainN}`,
          tenantLifecycleId: tenantRecord.id,
          response: res.data,
          apiLog: {
            request: { ...payload, _note: "credentials redacted" },
            response: res.data,
            httpStatus: res.status,
          },
        });
      }

      // Check if it's a domain collision error — retry with next number
      const errMsg = (res.data?.message || res.text || "").toLowerCase();
      const isDomainCollision = errMsg.includes("domain") && (errMsg.includes("taken") || errMsg.includes("exists") || errMsg.includes("already") || errMsg.includes("unavailable"));

      if (isDomainCollision) {
        console.log(`[LIVE ORDER] Domain GrowBig${domainN} collision, retrying...`);
        continue;
      }

      // Non-domain error — fail immediately
      console.error(`[LIVE ORDER] Failed for ${companyName}: ${res.text}`);
      return Response.json({
        status: "failed",
        reason: res.data?.message || res.text || `HTTP ${res.status}`,
        domainAttempted: `GrowBig${domainN}`,
        response: res.data,
        apiLog: {
          request: { ...payload, _note: "credentials redacted" },
          response: res.data,
          rawText: res.text,
          httpStatus: res.status,
        },
      });
    }

    // Exhausted retries
    await setDomainCounter(base44, currentN + retryLimit);
    return Response.json({
      status: "failed",
      reason: `Domain collision: exhausted ${retryLimit} attempts (GrowBig${currentN} through GrowBig${currentN + retryLimit - 1})`,
    });
  }

  // ── createCompanies (bulk from CSV data) ──
  if (action === "createCompanies") {
    const { companies } = body;
    if (!companies || !Array.isArray(companies)) return Response.json({ error: "companies array required" });

    const token = await getPax8Token();
    const results = [];

    for (const row of companies) {
      const companyPayload = {
        name: row.name,
        address: {
          street: row.address1 || "",
          street2: row.address2 || "",
          city: row.city || "",
          stateOrProvince: row.state || "",
          postalCode: row.postal_code || "",
          country: row.country || "US",
        },
        phone: row.phone || "",
        website: row.url || "",
        billOnBehalfOfEnabled: false,
        selfServiceAllowed: false,
        orderApprovalRequired: false,
      };

      // Add contact if provided
      if (row.contact_email && row.contact_first_name && row.contact_last_name) {
        companyPayload.contacts = [{
          firstName: row.contact_first_name,
          lastName: row.contact_last_name,
          email: row.contact_email,
          phone: row.contact_phoneNumber || row.phone || "",
          types: [
            { type: "Admin", primary: true },
            { type: "Billing", primary: true },
            { type: "Technical", primary: true },
          ],
        }];
      }

      console.log(`[CREATE COMPANY] Creating: ${row.name}`);
      const res = await pax8Post(token, "/companies", companyPayload);

      results.push({
        name: row.name,
        status: res.ok ? "success" : "failed",
        companyId: res.ok ? res.data?.id : null,
        error: res.ok ? null : (res.data?.message || res.text || `HTTP ${res.status}`),
        httpStatus: res.status,
      });

      // Small delay between API calls
      if (companies.indexOf(row) < companies.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    return Response.json({ results });
  }

  // ── patchCompanies (update existing companies via PUT) ──
  if (action === "patchCompanies") {
    const { companies, updates } = body;
    if (!companies || !Array.isArray(companies)) return Response.json({ error: "companies array required" });
    if (!updates || typeof updates !== "object") return Response.json({ error: "updates object required" });

    const token = await getPax8Token();
    const results = [];

    for (const company of companies) {
      // Fetch current company data first
      let current;
      try {
        current = await pax8Get(token, `/companies/${company.companyId}`);
      } catch (e) {
        results.push({ companyId: company.companyId, companyName: company.companyName, status: "failed", error: `Fetch failed: ${e.message}` });
        continue;
      }

      // Merge updates into current data for PUT
      const putBody = { ...current, ...updates };
      delete putBody.id;
      delete putBody.updatedDate;
      delete putBody.createdDate;

      console.log(`[PATCH] PUT body for ${company.companyName}: billOnBehalfOfEnabled=${putBody.billOnBehalfOfEnabled}`);

      const url = new URL(`${PAX8_API_BASE}/companies/${company.companyId}`);
      const res = await fetch(url.toString(), {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(putBody),
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { json = null; }

      // Log what Pax8 returned so we can verify the field actually changed
      const returnedValue = json?.billOnBehalfOfEnabled;
      console.log(`[PATCH] Response for ${company.companyName}: status=${res.status}, billOnBehalfOfEnabled=${returnedValue}`);

      results.push({
        companyId: company.companyId,
        companyName: company.companyName,
        status: res.ok ? "success" : "failed",
        httpStatus: res.status,
        error: res.ok ? null : (json?.message || text || `HTTP ${res.status}`),
        updatedFields: updates,
        returnedBillOnBehalf: returnedValue,
      });

      await new Promise(r => setTimeout(r, 300));
    }

    return Response.json({ results, totalPatched: results.filter(r => r.status === "success").length, totalFailed: results.filter(r => r.status === "failed").length });
  }

  // ── deleteCompanies (remove companies by ID) ──
  if (action === "deleteCompanies") {
    const { companies } = body;
    if (!companies || !Array.isArray(companies)) return Response.json({ error: "companies array required" });

    const token = await getPax8Token();
    const results = [];

    for (const company of companies) {
      const url = `${PAX8_API_BASE}/companies/${company.companyId}`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch { json = null; }

      console.log(`[DELETE] ${company.companyName}: status=${res.status}`);

      results.push({
        companyId: company.companyId,
        companyName: company.companyName,
        status: res.ok || res.status === 204 ? "deleted" : "failed",
        httpStatus: res.status,
        error: res.ok || res.status === 204 ? null : (json?.message || text || `HTTP ${res.status}`),
      });

      await new Promise(r => setTimeout(r, 300));
    }

    return Response.json({ results, totalDeleted: results.filter(r => r.status === "deleted").length, totalFailed: results.filter(r => r.status === "failed").length });
  }

  // ── debug (kept for investigation) ──
  if (action === "debug") {
    const { productId, step, subscriptionId } = body;
    const token = await getPax8Token();

    if (step === "provisionDetails") {
      const url = `${PAX8_API_BASE}/products/${productId || PRODUCT_ID}/provision-details`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const data = await res.json();
      const items = data.content || [];
      const pg = body.pg || 0;
      const chunk = items.slice(pg * 3, (pg + 1) * 3);
      return Response.json({ total: items.length, pg, keys: items.map(i => i.key), chunk });
    }

    if (step === "fetchSubscription") {
      if (!subscriptionId) return Response.json({ error: "subscriptionId required" });
      const res = await fetch(`${PAX8_API_BASE}/subscriptions/${subscriptionId}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      const rawText = await res.text();
      return new Response(rawText, { status: res.status, headers: { "Content-Type": "application/json" } });
    }

    if (step === "domainCounter") {
      const val = await getDomainCounter(base44);
      return Response.json({ currentDomainCounter: val });
    }

    if (step === "fetchCompany") {
      const { companyId, companyName } = body;
      let cid = companyId;
      if (!cid && companyName) {
        const search = await pax8Get(token, "/companies", { filter: companyName, size: 1 });
        cid = search.content?.[0]?.id;
        if (!cid) return Response.json({ error: "Company not found" });
      }
      if (!cid) return Response.json({ error: "Provide companyId or companyName" });
      const company = await pax8Get(token, `/companies/${cid}`);
      let contacts = [];
      try { contacts = (await pax8Get(token, `/companies/${cid}/contacts`)).content || []; } catch {}
      return Response.json({ company, contacts });
    }

    return Response.json({ error: "Provide step: provisionDetails | fetchSubscription | domainCounter" });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
});
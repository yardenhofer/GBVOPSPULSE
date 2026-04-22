import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const SCALESENDS_BASE_URL = "https://cloud-api.plugsaas.com";
const PORKBUN_BASE_URL = "https://api.porkbun.com/api/json/v3";

function getScalesendsCredentials() {
  const apiKey = (Deno.env.get("SCALESENDS_API_KEY") || "").replace(/[^\x20-\x7E]/g, "").trim();
  const customerId = (Deno.env.get("SCALESENDS_CUSTOMER_ID") || "").replace(/[^\x20-\x7E]/g, "").trim();
  if (!apiKey || !customerId) throw new Error("SCALESENDS_API_KEY or SCALESENDS_CUSTOMER_ID not configured");
  return { apiKey, customerId };
}

function getPorkbunCredentials() {
  const apiKey = (Deno.env.get("PORKBUN_API_KEY") || "").trim();
  const secretApiKey = (Deno.env.get("PORKBUN_SECRET_API_KEY") || "").trim();
  if (!apiKey || !secretApiKey) throw new Error("PORKBUN_API_KEY or PORKBUN_SECRET_API_KEY not configured");
  return { apiKey, secretApiKey };
}

function ssHeaders(apiKey) {
  return { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json", "Content-Type": "application/json" };
}

// ── Fetch required nameservers from Scalesends ──
async function getScalesendsNameservers(apiKey, customerId, orderId) {
  const url = `${SCALESENDS_BASE_URL}/api/v1/simple/customers/${customerId}/orders/${orderId}/nameservers/`;
  const res = await fetch(url, { headers: ssHeaders(apiKey) });
  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: `HTTP ${res.status}: ${text.substring(0, 200)}` };
  }
  const data = (await res.json()).data || {};
  return {
    success: true,
    nameservers: data.nameservers || [],
    nameserversStatus: data.nameserversStatus || "unknown",
    assignedRegistrar: data.assignedRegistrar || null,
    domain: data.domain || null,
  };
}

// ── Get current nameservers at Porkbun ──
async function getPorkbunNameservers(domain) {
  const { apiKey, secretApiKey } = getPorkbunCredentials();
  const url = `${PORKBUN_BASE_URL}/domain/getNs/${domain}`;
  console.log(`[PORKBUN] POST ${url} (getNs)`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey, secretapikey: secretApiKey }),
  });
  const text = await res.text();
  console.log(`[PORKBUN] getNs response: HTTP ${res.status} — ${text.substring(0, 500)}`);
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { httpStatus: res.status, raw: text.substring(0, 1000), data: json };
}

// ── Update nameservers at Porkbun ──
async function updatePorkbunNameservers(domain, nameservers) {
  const { apiKey, secretApiKey } = getPorkbunCredentials();
  const url = `${PORKBUN_BASE_URL}/domain/updateNs/${domain}`;
  console.log(`[PORKBUN] POST ${url} (updateNs) — ns: ${JSON.stringify(nameservers)}`);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apikey: apiKey, secretapikey: secretApiKey, ns: nameservers }),
  });
  const text = await res.text();
  console.log(`[PORKBUN] updateNs response: HTTP ${res.status} — ${text.substring(0, 500)}`);
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { httpStatus: res.status, raw: text.substring(0, 1000), data: json };
}

// ── Normalize NS arrays for comparison ──
function nsMatch(current, required) {
  const norm = (arr) => (arr || []).map(s => s.toLowerCase().replace(/\.$/, "")).sort();
  const a = norm(current);
  const b = norm(required);
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

// ── Process a single tenant: check & apply nameservers ──
async function processTenant(base44, tenant, ssApiKey, ssCustomerId, performedBy) {
  const orderId = tenant.scalesends_job_id;
  const domain = tenant.sending_domain;
  if (!orderId || !domain) {
    return { skipped: true, reason: "Missing orderId or sending_domain" };
  }

  // Step 1: Get required nameservers from Scalesends
  const ssResult = await getScalesendsNameservers(ssApiKey, ssCustomerId, orderId);
  if (!ssResult.success) {
    return { error: true, reason: `Scalesends fetch failed: ${ssResult.error}` };
  }

  const requiredNs = ssResult.nameservers;
  const nsStatus = ssResult.nameserversStatus;

  if (!requiredNs || requiredNs.length === 0) {
    return { skipped: true, reason: `No nameservers from Scalesends (status: ${nsStatus})` };
  }

  // Step 2: Get current nameservers at Porkbun (safeguard: don't apply twice)
  const currentResult = await getPorkbunNameservers(domain);
  
  // Check if domain is not in the Porkbun account
  if (currentResult.data?.status === "ERROR") {
    const errMsg = currentResult.data.message || "Unknown Porkbun error";
    const isDomainNotFound = errMsg.toLowerCase().includes("not found") || 
                              errMsg.toLowerCase().includes("invalid domain") ||
                              errMsg.toLowerCase().includes("not in your account");
    
    await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
      porkbun_last_error: errMsg,
      porkbun_last_response: JSON.stringify({ action: "getNs", response: currentResult.data, timestamp: new Date().toISOString() }),
    });
    
    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: "error",
      tenant_lifecycle_id: tenant.id,
      performed_by: performedBy || "system",
      detail: `Porkbun getNs failed for ${domain}: ${errMsg}${isDomainNotFound ? " — domain may not be registered via Porkbun" : ""}`,
    });
    
    return { error: true, reason: errMsg, domainNotInAccount: isDomainNotFound };
  }

  // Extract current NS from Porkbun response
  const currentNs = currentResult.data?.ns || [];
  
  // Check if already matching
  if (nsMatch(currentNs, requiredNs)) {
    console.log(`[PORKBUN] Nameservers already match for ${domain} — skipping update`);
    // Mark as applied if not already
    if (!tenant.porkbun_ns_applied_at) {
      await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
        porkbun_ns_applied_at: new Date().toISOString(),
        porkbun_last_response: JSON.stringify({ action: "getNs_match", currentNs, requiredNs, timestamp: new Date().toISOString() }),
        porkbun_last_error: null,
      });
    }
    return { alreadyMatched: true, currentNs, requiredNs };
  }

  // Step 3: Apply nameservers
  const updateResult = await updatePorkbunNameservers(domain, requiredNs);

  if (updateResult.data?.status === "SUCCESS") {
    await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
      porkbun_ns_applied_at: new Date().toISOString(),
      porkbun_last_response: JSON.stringify({ action: "updateNs", response: updateResult.data, requiredNs, timestamp: new Date().toISOString() }),
      porkbun_last_error: null,
    });

    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: "email_parsed",
      tenant_lifecycle_id: tenant.id,
      performed_by: performedBy || "system",
      detail: `Porkbun nameservers updated for ${domain}: ${requiredNs.join(", ")}`,
    });

    return { success: true, domain, requiredNs };
  } else {
    const errMsg = updateResult.data?.message || `HTTP ${updateResult.httpStatus}`;
    await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
      porkbun_last_error: errMsg,
      porkbun_last_response: JSON.stringify({ action: "updateNs", response: updateResult.data, requiredNs, timestamp: new Date().toISOString() }),
    });

    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: "error",
      tenant_lifecycle_id: tenant.id,
      performed_by: performedBy || "system",
      detail: `Porkbun updateNs failed for ${domain}: ${errMsg}`,
    });

    return { error: true, reason: errMsg, domain };
  }
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { action } = body;

  // syncAll runs from scheduled automation (no user context needed)
  // Manual actions require admin auth
  if (action !== "syncAll") {
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
    }
  }

  // ── getStatus: get Porkbun NS status for a single tenant ──
  if (action === "getStatus") {
    const { tenantId } = body;
    if (!tenantId) return Response.json({ error: "tenantId required" }, { status: 400 });

    const tenants = await base44.asServiceRole.entities.TenantLifecycle.filter({ id: tenantId });
    if (tenants.length === 0) return Response.json({ error: "Tenant not found" }, { status: 404 });
    const tenant = tenants[0];

    if (!tenant.scalesends_job_id || !tenant.sending_domain) {
      return Response.json({
        tenantId,
        domain: tenant.sending_domain || null,
        orderId: tenant.scalesends_job_id || null,
        status: "not_applicable",
        message: "Missing Scalesends order ID or sending domain",
      });
    }

    const { apiKey, customerId } = getScalesendsCredentials();

    // Fetch Scalesends NS info
    const ssResult = await getScalesendsNameservers(apiKey, customerId, tenant.scalesends_job_id);
    
    // Fetch current Porkbun NS
    let porkbunNs = null;
    let porkbunError = null;
    try {
      const pbResult = await getPorkbunNameservers(tenant.sending_domain);
      if (pbResult.data?.status === "SUCCESS") {
        porkbunNs = pbResult.data.ns || [];
      } else {
        porkbunError = pbResult.data?.message || `HTTP ${pbResult.httpStatus}`;
      }
    } catch (e) {
      porkbunError = e.message;
    }

    const requiredNs = ssResult.success ? ssResult.nameservers : [];
    const matched = porkbunNs && requiredNs.length > 0 ? nsMatch(porkbunNs, requiredNs) : false;

    return Response.json({
      tenantId,
      domain: tenant.sending_domain,
      orderId: tenant.scalesends_job_id,
      scalesendsNameserversStatus: ssResult.success ? ssResult.nameserversStatus : "fetch_failed",
      requiredNameservers: requiredNs,
      currentPorkbunNameservers: porkbunNs,
      porkbunError,
      matched,
      appliedAt: tenant.porkbun_ns_applied_at || null,
      lastError: tenant.porkbun_last_error || null,
      lastResponse: tenant.porkbun_last_response ? JSON.parse(tenant.porkbun_last_response) : null,
    });
  }

  // ── applyNs: manually apply nameservers for a single tenant ──
  if (action === "applyNs") {
    const { tenantId } = body;
    if (!tenantId) return Response.json({ error: "tenantId required" }, { status: 400 });

    const tenants = await base44.asServiceRole.entities.TenantLifecycle.filter({ id: tenantId });
    if (tenants.length === 0) return Response.json({ error: "Tenant not found" }, { status: 404 });

    const { apiKey, customerId } = getScalesendsCredentials();
    const caller = await base44.auth.me();
    const result = await processTenant(base44, tenants[0], apiKey, customerId, caller?.email || "admin");
    return Response.json(result);
  }

  // ── syncAll: run the Porkbun NS workflow across all eligible tenants ──
  if (action === "syncAll") {
    // Check feature flag
    const useAutofix = await getFeatureFlag(base44, "use_scalesends_autofix");
    if (useAutofix) {
      return Response.json({ skipped: true, message: "Porkbun workaround disabled — use_scalesends_autofix is ON (Scalesends handling NS directly)" });
    }

    const { apiKey, customerId } = getScalesendsCredentials();
    const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);

    // Count tenants in each category for diagnostics
    const withJobAndDomain = allTenants.filter(t => t.scalesends_job_id && t.sending_domain && t.scalesends_status && t.scalesends_status !== "failed" && t.scalesends_status !== "manual_upload");
    const alreadyDone = withJobAndDomain.filter(t => t.porkbun_ns_applied_at && !t.porkbun_last_error);

    // Filter: has a Scalesends order, has a sending domain, and NS not yet confirmed
    const eligible = withJobAndDomain.filter(t => {
      if (t.porkbun_ns_applied_at && !t.porkbun_last_error) return false;
      return true;
    });

    const results = [];
    for (const tenant of eligible) {
      const result = await processTenant(base44, tenant, apiKey, customerId, "system/sync");
      results.push({ tenantId: tenant.id, domain: tenant.sending_domain, ...result });
      if (eligible.indexOf(tenant) < eligible.length - 1) {
        await new Promise(r => setTimeout(r, 10000));
      }
    }

    // ── Also process orphaned Scalesends orders (exist in Scalesends but no tenant record) ──
    const linkedJobIds = new Set(allTenants.filter(t => t.scalesends_job_id).map(t => t.scalesends_job_id));
    let allOrders = [];
    try {
      const listUrl = `${SCALESENDS_BASE_URL}/api/v1/simple/customers/${customerId}/orders/`;
      const listRes = await fetch(listUrl, { headers: { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json" } });
      if (listRes.ok) {
        const listData = await listRes.json();
        allOrders = Array.isArray(listData.data) ? listData.data : (Array.isArray(listData) ? listData : []);
      }
    } catch (e) { console.log(`[PORKBUN] Warning: could not fetch Scalesends orders: ${e.message}`); }

    const orphanedOrders = allOrders.filter(o => !linkedJobIds.has(o._id) && o.domain);
    const orphanResults = [];
    for (const order of orphanedOrders) {
      const domain = order.domain || order.endDomain;
      if (!domain) continue;

      // Get required NS from Scalesends
      const ssResult = await getScalesendsNameservers(apiKey, customerId, order._id);
      if (!ssResult.success || !ssResult.nameservers || ssResult.nameservers.length === 0) {
        orphanResults.push({ orderId: order._id, domain, skipped: true, reason: `No NS from Scalesends (${ssResult.error || ssResult.nameserversStatus})` });
        continue;
      }

      // Get current NS at Porkbun
      const currentResult = await getPorkbunNameservers(domain);
      if (currentResult.data?.status === "ERROR") {
        orphanResults.push({ orderId: order._id, domain, error: true, reason: currentResult.data.message || "Porkbun error" });
        if (orphanedOrders.indexOf(order) < orphanedOrders.length - 1) await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      const currentNs = currentResult.data?.ns || [];
      if (nsMatch(currentNs, ssResult.nameservers)) {
        orphanResults.push({ orderId: order._id, domain, alreadyMatched: true });
        if (orphanedOrders.indexOf(order) < orphanedOrders.length - 1) await new Promise(r => setTimeout(r, 10000));
        continue;
      }

      // Apply NS
      const updateResult = await updatePorkbunNameservers(domain, ssResult.nameservers);
      if (updateResult.data?.status === "SUCCESS") {
        orphanResults.push({ orderId: order._id, domain, success: true, requiredNs: ssResult.nameservers });
        console.log(`[PORKBUN] Applied NS for orphaned order ${order._id} (${domain})`);
      } else {
        orphanResults.push({ orderId: order._id, domain, error: true, reason: updateResult.data?.message || `HTTP ${updateResult.httpStatus}` });
      }
      if (orphanedOrders.indexOf(order) < orphanedOrders.length - 1) await new Promise(r => setTimeout(r, 10000));
    }

    return Response.json({
      eligible: eligible.length,
      alreadyDone: alreadyDone.length,
      totalWithJob: withJobAndDomain.length,
      results,
      orphanedProcessed: orphanResults.length,
      orphanResults,
      successCount: results.filter(r => r.success).length + orphanResults.filter(r => r.success).length,
      alreadyMatchedCount: results.filter(r => r.alreadyMatched).length + orphanResults.filter(r => r.alreadyMatched).length,
      errorCount: results.filter(r => r.error).length + orphanResults.filter(r => r.error).length,
      skippedCount: results.filter(r => r.skipped).length + orphanResults.filter(r => r.skipped).length,
    });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
});

// ── Feature flag helper ──
async function getFeatureFlag(base44, key) {
  const settings = await base44.asServiceRole.entities.AppSettings.filter({ key });
  if (settings.length === 0) return false;
  return settings[0].value === "true";
}
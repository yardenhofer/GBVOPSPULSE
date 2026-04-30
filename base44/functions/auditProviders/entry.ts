import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE_URL = "https://cloud-api.plugsaas.com";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const apiKey = (Deno.env.get("SCALESENDS_API_KEY") || "").replace(/[^\x20-\x7E]/g, "").trim();
  const customerId = (Deno.env.get("SCALESENDS_CUSTOMER_ID") || "").replace(/[^\x20-\x7E]/g, "").trim();
  if (!apiKey || !customerId) return Response.json({ error: "Credentials not configured" }, { status: 500 });

  const headers = { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json", "Content-Type": "application/json" };

  const body = await req.json();
  const { action } = body;

  // ── audit: List all distinct provider flags and their counts ──
  if (action === "audit") {
    const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);

    // Extract distinct provider flags
    const flagCounts = {};
    const tenantsByFlag = {};
    for (const t of allTenants) {
      const flags = t.flags || "";
      const providerMatch = flags.match(/provider:([^,]+)/);
      const providerFlag = providerMatch ? providerMatch[1].trim() : null;
      if (providerFlag) {
        flagCounts[providerFlag] = (flagCounts[providerFlag] || 0) + 1;
        if (!tenantsByFlag[providerFlag]) tenantsByFlag[providerFlag] = [];
        tenantsByFlag[providerFlag].push({
          id: t.id,
          domain: t.ms_tenant_domain,
          company: t.pax8_company_name,
          orderId: t.scalesends_job_id,
          scalesendsStatus: t.scalesends_status,
          overallStatus: t.overall_status,
        });
      }
    }

    // Fetch Scalesends providers
    const provUrl = `${BASE_URL}/api/v1/simple/customers/${customerId}/inbox-providers/get/`;
    const provRes = await fetch(provUrl, { headers });
    let scalesendsProviders = [];
    if (provRes.ok) {
      const provData = await provRes.json();
      scalesendsProviders = (provData.data || provData || []).map(p => ({ name: p.name, provider: p.provider }));
    }

    return Response.json({
      flagCounts,
      tenantsByFlag,
      scalesendsProviders,
      totalTenants: allTenants.length,
    });
  }

  // ── fix: Apply provider mapping to Scalesends orders based on tenant flags ──
  if (action === "fix") {
    const { mapping, dryRun } = body;
    // mapping is an object like: { "Omni Instantly": "Kapital Funding WKSP | GBV Instantly", ... }
    // Only fix tenants whose flag maps to a DIFFERENT provider than what's currently assigned
    if (!mapping || typeof mapping !== "object") {
      return Response.json({ error: "mapping object required, e.g. { 'Omni Instantly': 'Kapital Funding WKSP | GBV Instantly' }" }, { status: 400 });
    }

    const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);

    // Find tenants that need fixing based on the mapping
    const toFix = [];
    for (const t of allTenants) {
      if (!t.scalesends_job_id) continue;
      const flags = t.flags || "";
      const providerMatch = flags.match(/provider:([^,]+)/);
      const providerFlag = providerMatch ? providerMatch[1].trim() : null;
      if (!providerFlag) continue;

      const correctProvider = mapping[providerFlag];
      if (!correctProvider) continue; // No mapping for this flag, skip

      toFix.push({
        id: t.id,
        domain: t.ms_tenant_domain,
        company: t.pax8_company_name,
        orderId: t.scalesends_job_id,
        flag: providerFlag,
        correctProvider,
      });
    }

    if (dryRun) {
      return Response.json({
        dryRun: true,
        wouldFix: toFix.length,
        orders: toFix,
      });
    }

    // Actually fix them
    const results = [];
    for (const item of toFix) {
      const addUrl = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${item.orderId}/inbox-providers/add/`;
      const addRes = await fetch(addUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: item.correctProvider, provider: "instantly" }),
      });
      const addText = await addRes.text();
      let addJson = null;
      try { addJson = JSON.parse(addText); } catch {}

      results.push({
        orderId: item.orderId,
        domain: item.domain,
        company: item.company,
        flag: item.flag,
        assignedProvider: item.correctProvider,
        success: addRes.ok,
        currentProviders: addJson?.data || null,
        error: addRes.ok ? null : addText.substring(0, 200),
      });
    }

    return Response.json({
      total: toFix.length,
      fixed: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
});
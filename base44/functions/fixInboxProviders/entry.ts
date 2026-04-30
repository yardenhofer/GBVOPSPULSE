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

  // Step 1: Get all order IDs for tenants with flags containing "provider:Omni Instantly"
  if (action === "getAffectedOrders") {
    const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);
    const affected = allTenants.filter(t => 
      t.flags && t.flags.includes("provider:Omni Instantly") && t.scalesends_job_id
    );
    const orderIds = affected.map(t => t.scalesends_job_id);
    return Response.json({ 
      count: affected.length, 
      orderIds,
      tenants: affected.map(t => ({ id: t.id, domain: t.ms_tenant_domain, orderId: t.scalesends_job_id, flags: t.flags }))
    });
  }

  // Step 2: Just add provider (Scalesends may allow multiple or replace)
  if (action === "addProvider") {
    const { orderIds, providerName, providerType } = body;
    if (!orderIds || !Array.isArray(orderIds)) return Response.json({ error: "orderIds required" }, { status: 400 });
    if (!providerName) return Response.json({ error: "providerName required" }, { status: 400 });

    const results = [];
    for (const orderId of orderIds) {
      const addUrl = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${orderId}/inbox-providers/add/`;
      const addRes = await fetch(addUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({ name: providerName, provider: providerType || "instantly" }),
      });
      const addText = await addRes.text();
      let addJson = null;
      try { addJson = JSON.parse(addText); } catch {}

      results.push({ 
        orderId, 
        success: addRes.ok, 
        providers: addJson?.data || null,
        error: addRes.ok ? null : addText.substring(0, 200)
      });
    }

    return Response.json({ 
      total: orderIds.length, 
      assigned: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results 
    });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
});
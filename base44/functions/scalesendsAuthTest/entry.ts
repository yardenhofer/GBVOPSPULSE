import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE_URL = "https://cloud-api.plugsaas.com";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user || user.role !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;

    const apiKey = (Deno.env.get("SCALESENDS_API_KEY") || "").replace(/[^\x20-\x7E]/g, "").trim();
    const customerId = (Deno.env.get("SCALESENDS_CUSTOMER_ID") || "").replace(/[^\x20-\x7E]/g, "").trim();

    if (!apiKey || !customerId) {
      return Response.json({ error: "SCALESENDS_API_KEY or SCALESENDS_CUSTOMER_ID not set" });
    }

    const headers = {
      "Authorization": `Bearer ${apiKey}`,
      "Accept": "application/json",
      "Content-Type": "application/json",
    };

    // ── listOrders: list existing orders ──
    if (action === "listOrders") {
      const res = await fetch(`${BASE_URL}/api/v1/simple/customers/${customerId}/orders/`, { headers });
      const data = await res.json();
      // Return just the first 3 orders to understand structure
      const orders = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
      return Response.json({
        totalOrders: orders.length,
        sampleOrders: orders.slice(0, 3).map(o => ({
          _id: o._id,
          email: o.email,
          domain: o.domain,
          endDomain: o.endDomain,
          status: o.status,
          onboardStatus: o.onboardStatus,
          mailboxCount: o.mailboxes?.length || 0,
          allKeys: Object.keys(o),
        })),
      });
    }

    // ── inspectOrder: return full order structure including sample mailboxes ──
    if (action === "inspectOrder") {
      const res = await fetch(`${BASE_URL}/api/v1/simple/customers/${customerId}/orders/`, { headers });
      const data = await res.json();
      const orders = Array.isArray(data.data) ? data.data : (Array.isArray(data) ? data : []);
      const orderId = body.orderId;
      const order = orderId ? orders.find(o => o._id === orderId) : orders[0];
      if (!order) return Response.json({ error: "Order not found" });
      
      const sampleMailboxes = (order.mailboxes || []).slice(0, 5);
      return Response.json({
        _id: order._id,
        email: order.email,
        domain: order.domain,
        endDomain: order.endDomain,
        onboardStatus: order.onboardStatus,
        provider: order.provider,
        company: order.company,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        totalMailboxes: (order.mailboxes || []).length,
        sampleMailboxes: sampleMailboxes.map(m => ({
          allKeys: Object.keys(m),
          ...m,
        })),
        fullOrderKeys: Object.keys(order),
      });
    }

    // ── getOrderDetail: get single order ──
    if (action === "getOrderDetail") {
      const { orderId } = body;
      const res = await fetch(`${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${orderId}`, { headers });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      return Response.json({ status: res.status, data: json, raw: text.substring(0, 2000) });
    }

    // ── testCreate: test creating an order (dry run with real data) ──
    if (action === "testCreate") {
      const { email, password } = body;
      if (!email || !password) return Response.json({ error: "email and password required" });

      console.log(`[SCALESENDS] Creating order for: ${email}`);
      const res = await fetch(`${BASE_URL}/api/v1/simple/customers/${customerId}/orders/`, {
        method: "POST",
        headers,
        body: JSON.stringify({ email, password }),
      });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      console.log(`[SCALESENDS] Create response: HTTP ${res.status} — ${text.substring(0, 500)}`);

      return Response.json({ status: res.status, success: res.ok, data: json, raw: text.substring(0, 2000) });
    }

    // ── getNameservers: fetch nameserver/registrar info for an order ──
    if (action === "getNameservers") {
      const { orderId } = body;
      if (!orderId) return Response.json({ error: "orderId required" });
      const url = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${orderId}/nameservers/`;
      console.log(`[SCALESENDS] GET ${url}`);
      const res = await fetch(url, { headers });
      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}
      console.log(`[SCALESENDS] Nameservers response: HTTP ${res.status} — ${text.substring(0, 2000)}`);
      return Response.json({ status: res.status, data: json, raw: text.substring(0, 2000) });
    }

    return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error) {
    console.error("[SCALESENDS TEST] Error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
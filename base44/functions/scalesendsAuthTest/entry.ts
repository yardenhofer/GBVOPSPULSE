import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE_URL = "https://cloud-api.plugsaas.com";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const rawApiKey = Deno.env.get("SCALESENDS_API_KEY") || "";
    const rawCustomerId = Deno.env.get("SCALESENDS_CUSTOMER_ID") || "";
    // Strip non-ASCII and whitespace
    const apiKey = rawApiKey.replace(/[^\x20-\x7E]/g, "").trim();
    const customerId = rawCustomerId.replace(/[^\x20-\x7E]/g, "").trim();

    console.log(`[AUTH TEST] API key length: ${apiKey.length}, raw length: ${rawApiKey.length}, first 8: ${apiKey.substring(0, 8)}`);
    console.log(`[AUTH TEST] Customer ID length: ${customerId.length}, value: ${customerId}`);

    if (!apiKey || !customerId) {
      return Response.json({ error: "SCALESENDS_API_KEY or SCALESENDS_CUSTOMER_ID not set" });
    }

    const testUrl = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/`;
    const headerFormats = [
      { name: "Bearer", headers: { "Authorization": `Bearer ${apiKey}` } },
      { name: "x-api-key", headers: { "x-api-key": apiKey } },
      { name: "X-Partner-API-Key", headers: { "X-Partner-API-Key": apiKey } },
    ];

    const results = [];

    for (const format of headerFormats) {
      console.log(`[AUTH TEST] Testing: ${format.name} against GET ${testUrl}`);

      const res = await fetch(testUrl, {
        method: "GET",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          ...format.headers,
        },
      });

      const text = await res.text();
      let json = null;
      try { json = JSON.parse(text); } catch {}

      console.log(`[AUTH TEST] ${format.name}: HTTP ${res.status} — ${text.substring(0, 500)}`);

      results.push({
        format: format.name,
        status: res.status,
        success: res.status >= 200 && res.status < 300,
        response: json || text.substring(0, 500),
      });

      if (res.status >= 200 && res.status < 300) {
        break;
      }
    }

    const winner = results.find(r => r.success);

    return Response.json({
      testUrl,
      customerId: customerId.substring(0, 6) + "...",
      apiKeyPresent: true,
      results,
      winner: winner ? winner.format : null,
      recommendation: winner
        ? `Use "${winner.format}" header format for all Scalesends API calls.`
        : "No auth format worked. Leon should contact Scalesends support for the correct auth header.",
    });
  } catch (error) {
    console.error("[AUTH TEST] Error:", error.message, error.stack);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
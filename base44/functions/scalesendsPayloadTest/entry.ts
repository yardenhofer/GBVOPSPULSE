import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const BASE_URL = "https://cloud-api.plugsaas.com";

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { action, tenantId, sendingDomain } = body;

  const apiKey = (Deno.env.get("SCALESENDS_API_KEY") || "").replace(/[^\x20-\x7E]/g, "").trim();
  const customerId = (Deno.env.get("SCALESENDS_CUSTOMER_ID") || "").replace(/[^\x20-\x7E]/g, "").trim();
  if (!apiKey || !customerId) {
    return Response.json({ error: "SCALESENDS_API_KEY or SCALESENDS_CUSTOMER_ID not configured" });
  }

  const url = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/add/`;
  const authHeader = `Bearer ${apiKey}`;
  const headers = {
    "Authorization": authHeader,
    "Accept": "application/json",
    "Content-Type": "application/json",
  };

  // Helper: make a request and capture everything
  async function testPayload(stepName, payload) {
    const maskedPayload = { ...payload, password: "***MASKED***" };
    console.log(`\n===== ${stepName} =====`);
    console.log(`URL: ${url}`);
    console.log(`Auth: Bearer ${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`);
    console.log(`Payload: ${JSON.stringify(maskedPayload)}`);

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });

    const responseText = await res.text();
    const responseHeaders = {};
    for (const [key, value] of res.headers.entries()) {
      responseHeaders[key] = value;
    }

    console.log(`Status: ${res.status}`);
    console.log(`Response Body: ${responseText.substring(0, 2000)}`);
    console.log(`Response Headers: ${JSON.stringify(responseHeaders)}`);

    let responseJson = null;
    try { responseJson = JSON.parse(responseText); } catch {}

    return {
      step: stepName,
      url,
      authHeaderFormat: `Bearer <key_starting_with_${apiKey.substring(0, 8)}>`,
      payloadSent: maskedPayload,
      httpStatus: res.status,
      success: res.ok,
      responseBody: responseJson || responseText.substring(0, 2000),
      responseHeaders,
    };
  }

  if (action === "systematicTest") {
    if (!tenantId) return Response.json({ error: "tenantId required" }, { status: 400 });

    // Fetch tenant data
    const tenants = await base44.asServiceRole.entities.TenantLifecycle.filter({ id: tenantId });
    if (tenants.length === 0) return Response.json({ error: "Tenant not found" }, { status: 404 });
    const tenant = tenants[0];

    const email = tenant.ms_admin_username;
    const password = tenant.ms_admin_password_encrypted;
    const domain = sendingDomain || null;
    const companyName = tenant.pax8_company_name || "";
    const tenantDomainFull = tenant.ms_tenant_domain || "";

    if (!email || !password) {
      return Response.json({ error: "Tenant missing email or password" });
    }

    console.log(`\n========================================`);
    console.log(`SYSTEMATIC SCALESENDS PAYLOAD TEST`);
    console.log(`Tenant: ${tenantId}`);
    console.log(`Email: ${email}`);
    console.log(`Sending Domain: ${domain || "NOT PROVIDED"}`);
    console.log(`Company: ${companyName}`);
    console.log(`Tenant Domain: ${tenantDomainFull}`);
    console.log(`========================================\n`);

    const results = [];

    // ── STEP 1: email + domain + password (spec required fields) ──
    if (!domain) {
      results.push({ step: "Step 1", skipped: true, reason: "No sendingDomain provided — cannot test with domain field. Pass sendingDomain parameter." });
    } else {
      const step1 = await testPayload("Step 1: email + domain + password", {
        email,
        domain,
        password,
      });
      results.push(step1);

      if (step1.success) {
        return Response.json({ stoppedAt: "Step 1 — SUCCESS", results });
      }

      // ── STEP 2: + provider: "outlook" ──
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 2000));

      const step2 = await testPayload("Step 2: + provider outlook", {
        email,
        domain,
        password,
        provider: "outlook",
      });
      results.push(step2);

      if (step2.success) {
        return Response.json({ stoppedAt: "Step 2 — SUCCESS", results });
      }

      // ── STEP 3: + full onboarding object ──
      await new Promise(r => setTimeout(r, 2000));

      const step3 = await testPayload("Step 3: + onboarding object", {
        email,
        domain,
        password,
        provider: "outlook",
        onboarding: {
          company: companyName,
          domain: tenantDomainFull,
          endDomain: domain,
        },
      });
      results.push(step3);

      if (step3.success) {
        return Response.json({ stoppedAt: "Step 3 — SUCCESS", results });
      }
    }

    // ── STEP 4: If all failed, capture full diagnostics ──
    // Also try a bare minimum call (just email + password, like we've been doing) for comparison
    await new Promise(r => setTimeout(r, 2000));

    const stepBaseline = await testPayload("Baseline: email + password only (current approach)", {
      email,
      password,
    });
    results.push(stepBaseline);

    return Response.json({
      stoppedAt: "All steps failed — diagnostics captured",
      tenantInfo: {
        id: tenantId,
        email,
        password: "***MASKED***",
        sendingDomain: domain,
        companyName,
        tenantDomainFull,
      },
      apiInfo: {
        url,
        customerId,
        authHeaderFormat: `Bearer <key_starting_with_${apiKey.substring(0, 8)}>`,
        apiKeyLength: apiKey.length,
      },
      results,
    });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
});
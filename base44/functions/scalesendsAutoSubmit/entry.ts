import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// This automation fires when a TenantLifecycle record is updated with overall_status = "tenant_provisioned"
// It checks if auto-submit is enabled and if so, submits the tenant to Scalesends automatically.

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const body = await req.json();
  const { event, data } = body;

  if (!data || !event) {
    return Response.json({ skipped: true, reason: "No event data" });
  }

  const tenantId = event.entity_id;
  console.log(`[SCALESENDS-AUTO] Triggered for tenant ${tenantId}, overall_status: ${data.overall_status}`);

  // Check if auto-submit is enabled
  const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: "scalesends_auto_submit" });
  const autoSubmit = settings.length > 0 && settings[0].value === "true";

  if (!autoSubmit) {
    console.log(`[SCALESENDS-AUTO] Auto-submit is OFF — skipping tenant ${tenantId}`);
    return Response.json({ skipped: true, reason: "Auto-submit disabled" });
  }

  // Check kill switch
  const pauseSettings = await base44.asServiceRole.entities.AppSettings.filter({ key: "pause_scalesends" });
  const paused = pauseSettings.length > 0 && pauseSettings[0].value === "true";

  if (paused) {
    console.log(`[SCALESENDS-AUTO] Kill switch active — skipping tenant ${tenantId}`);
    return Response.json({ skipped: true, reason: "Kill switch active" });
  }

  // Fetch latest tenant data to make sure we have all fields
  const tenants = await base44.asServiceRole.entities.TenantLifecycle.filter({ id: tenantId });
  if (tenants.length === 0) {
    return Response.json({ skipped: true, reason: "Tenant not found" });
  }
  const tenant = tenants[0];

  // Validate tenant has credentials
  if (!tenant.ms_admin_username || !tenant.ms_admin_password_encrypted) {
    console.log(`[SCALESENDS-AUTO] Tenant ${tenantId} missing credentials — skipping`);
    return Response.json({ skipped: true, reason: "Missing credentials" });
  }

  // Don't resubmit if already has a scalesends status
  if (tenant.scalesends_status) {
    console.log(`[SCALESENDS-AUTO] Tenant ${tenantId} already has scalesends_status: ${tenant.scalesends_status} — skipping`);
    return Response.json({ skipped: true, reason: `Already has status: ${tenant.scalesends_status}` });
  }

  // Submit directly using the Scalesends API (can't call scalesendsSubmit because it requires admin auth)
  console.log(`[SCALESENDS-AUTO] Auto-submitting tenant ${tenantId} (${tenant.ms_tenant_domain}) to Scalesends`);

  const apiKey = (Deno.env.get("SCALESENDS_API_KEY") || "").replace(/[^\x20-\x7E]/g, "").trim();
  const customerId = (Deno.env.get("SCALESENDS_CUSTOMER_ID") || "").replace(/[^\x20-\x7E]/g, "").trim();
  if (!apiKey || !customerId) {
    console.log(`[SCALESENDS-AUTO] SCALESENDS_API_KEY or SCALESENDS_CUSTOMER_ID not configured`);
    return Response.json({ skipped: true, reason: "Scalesends credentials not configured" });
  }

  // Check daily cap
  const capSettings = await base44.asServiceRole.entities.AppSettings.filter({ key: "scalesends_daily_cap" });
  const dailyCap = capSettings.length > 0 ? parseInt(capSettings[0].value, 10) : 20;
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const allTenants = await base44.asServiceRole.entities.TenantLifecycle.list("-created_date", 500);
  const todaySubmissions = allTenants.filter(t =>
    t.scalesends_submitted_at && new Date(t.scalesends_submitted_at) >= todayStart
  ).length;
  if (todaySubmissions >= dailyCap) {
    console.log(`[SCALESENDS-AUTO] Daily cap reached (${todaySubmissions}/${dailyCap})`);
    return Response.json({ skipped: true, reason: `Daily cap reached (${todaySubmissions}/${dailyCap})` });
  }

  // ── Pre-submission check: look for existing order in Scalesends ──
  const BASE_URL = "https://cloud-api.plugsaas.com";
  const headers = { "Authorization": `Bearer ${apiKey}`, "Accept": "application/json", "Content-Type": "application/json" };

  // Resolve default inbox provider early (needed for both linked and new order paths)
  let inboxProvider = null;
  const defaultProviders = await base44.asServiceRole.entities.InboxProvider.filter({ is_default: true });
  if (defaultProviders.length > 0) {
    inboxProvider = { name: defaultProviders[0].provider_name, provider: defaultProviders[0].provider_type };
    console.log(`[SCALESENDS-AUTO] Using default inbox provider: ${JSON.stringify(inboxProvider)}`);
  }

  let existingOrders = [];
  try {
    const listRes = await fetch(`${BASE_URL}/api/v1/simple/customers/${customerId}/orders/`, { headers });
    if (listRes.ok) {
      const listData = await listRes.json();
      existingOrders = Array.isArray(listData.data) ? listData.data : (Array.isArray(listData) ? listData : []);
    }
  } catch (e) { console.log(`[SCALESENDS-AUTO] Warning: could not fetch orders list: ${e.message}`); }

  const adminEmail = (tenant.ms_admin_username || "").toLowerCase();
  const tenantDomain = (tenant.ms_tenant_domain || "").toLowerCase();
  const msDomain = (tenant.ms_domain || "").toLowerCase();

  let existingOrder = null;
  for (const order of existingOrders) {
    const oEmail = (order.email || "").toLowerCase();
    const oDomain = (order.domain || "").toLowerCase();
    const oEnd = (order.endDomain || "").toLowerCase();
    if (adminEmail && oEmail && oEmail === adminEmail) { existingOrder = order; break; }
    if (tenantDomain && oDomain && tenantDomain.includes(oDomain)) { existingOrder = order; break; }
    if (msDomain && oDomain && oDomain.includes(msDomain.toLowerCase())) { existingOrder = order; break; }
    if (tenantDomain && oEnd && tenantDomain.includes(oEnd)) { existingOrder = order; break; }
  }

  if (existingOrder) {
    const mCount = existingOrder.mailboxes?.length || 0;
    const onboard = (existingOrder.onboardStatus || "").toLowerCase();
    const isComplete = mCount > 0 && (onboard === "complete" || onboard === "onboarded" || onboard === "ready");
    const sStatus = isComplete ? "complete" : "processing";
    const oStatus = isComplete ? "inboxes_ready" : "inboxes_creating";
    const updateData = { scalesends_status: sStatus, scalesends_job_id: existingOrder._id, overall_status: oStatus, scalesends_inbox_count: mCount };
    if (isComplete) {
      updateData.scalesends_completed_at = existingOrder.updatedAt || new Date().toISOString();
      updateData.scalesends_inbox_details = JSON.stringify((existingOrder.mailboxes || []).map(m => ({ name: m.name, email: m.email, password: m.password })));
    }

    // Also assign inbox provider to the linked order (may already have one, but safe to call)
    if (inboxProvider && existingOrder._id) {
      const provUrl = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${existingOrder._id}/inbox-providers/add/`;
      const provRes = await fetch(provUrl, { method: "POST", headers, body: JSON.stringify({ name: inboxProvider.name, provider: inboxProvider.provider }) });
      if (provRes.ok) {
        console.log(`[SCALESENDS-AUTO] Assigned provider ${inboxProvider.name} to linked order ${existingOrder._id}`);
      } else {
        console.log(`[SCALESENDS-AUTO] Provider assignment failed for linked order ${existingOrder._id}: HTTP ${provRes.status}`);
      }
    }

    await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, updateData);
    await base44.asServiceRole.entities.TenantAuditLog.create({ action: "email_linked", tenant_lifecycle_id: tenant.id, detail: `Auto-submit: Found existing Scalesends order (ID: ${existingOrder._id}, status: ${sStatus}). Linked instead of creating new.` });
    console.log(`[SCALESENDS-AUTO] Found existing order ${existingOrder._id} for tenant ${tenantId} — linked`);
    return Response.json({ success: true, linked: true, tenantId, orderId: existingOrder._id });
  }

  // Get random names for the order
  const namePoolSetting = await base44.asServiceRole.entities.AppSettings.filter({ key: "scalesends_name_pool" });
  let names = [];
  if (namePoolSetting.length > 0 && namePoolSetting[0].value) {
    const allNames = JSON.parse(namePoolSetting[0].value);
    const shuffled = [...allNames].sort(() => Math.random() - 0.5);
    names = shuffled.slice(0, Math.min(100, shuffled.length));
  }

  // Step 1: Create order (without inboxProvider in payload)
  const sendingDomain = tenant.sending_domain || (tenant.pax8_company_name ? tenant.pax8_company_name.toLowerCase().replace(/[^a-z0-9]/g, "") + ".info" : "");
  const orderPayload = { email: tenant.ms_admin_username, password: tenant.ms_admin_password_encrypted, provider: "outlook" };
  if (sendingDomain) orderPayload.domain = sendingDomain;
  if (names.length > 0) orderPayload.names = names;

  const url = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/add/`;
  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(orderPayload),
  });

  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  console.log(`[SCALESENDS-AUTO] API response: HTTP ${res.status} — ${text.substring(0, 500)}`);

  if (res.ok) {
    const order = json?.data || json;
    let orderId = order?._id || order?.id || null;
    const mailboxCount = order?.mailboxes?.length || 0;

    // Fallback: if API didn't return an order ID, look it up by email
    if (!orderId) {
      console.log(`[SCALESENDS-AUTO] Warning: create returned no order ID. Looking up by email: ${tenant.ms_admin_username}`);
      const lookupRes = await fetch(`${BASE_URL}/api/v1/simple/customers/${customerId}/orders/`, { headers });
      if (lookupRes.ok) {
        const lookupData = await lookupRes.json();
        const allOrders = Array.isArray(lookupData.data) ? lookupData.data : (Array.isArray(lookupData) ? lookupData : []);
        const emailLower = tenant.ms_admin_username.toLowerCase().trim();
        const found = allOrders.find(o => (o.email || "").toLowerCase().trim() === emailLower);
        if (found) {
          orderId = found._id;
          console.log(`[SCALESENDS-AUTO] Found order ID via lookup: ${orderId}`);
        } else {
          console.log(`[SCALESENDS-AUTO] Could not find order by email after creation`);
        }
      }
    }

    // Step 2: Assign inbox provider (separate API call)
    let providerInfo = "";
    if (orderId && inboxProvider) {
      const provUrl = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${orderId}/inbox-providers/add/`;
      console.log(`[SCALESENDS-AUTO] Assigning inbox provider for order ${orderId}`);
      const provRes = await fetch(provUrl, { method: "POST", headers, body: JSON.stringify({ name: inboxProvider.name, provider: inboxProvider.provider }) });
      if (provRes.ok) {
        providerInfo = `. Provider: ${inboxProvider.name}`;
        console.log(`[SCALESENDS-AUTO] Provider assigned: ${inboxProvider.name}`);
      } else {
        console.log(`[SCALESENDS-AUTO] Set-provider failed: HTTP ${provRes.status}`);
      }
    }

    // Step 3: Assign registrar (separate API call)
    let registrarInfo = "";
    if (orderId) {
      const nsUrl = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${orderId}/nameservers/`;
      console.log(`[SCALESENDS-AUTO] Fetching registrars for order ${orderId}`);
      const nsRes = await fetch(nsUrl, { headers });
      if (nsRes.ok) {
        const nsData = await nsRes.json();
        const registrars = (nsData.data || nsData).availableRegistrars || [];
        if (registrars.length > 0) {
          const regName = registrars[0].name;
          const setUrl = `${BASE_URL}/api/v1/simple/customers/${customerId}/orders/${orderId}/set-registrar/`;
          const setRes = await fetch(setUrl, { method: "POST", headers, body: JSON.stringify({ registrarName: regName }) });
          if (setRes.ok) {
            registrarInfo = `. Registrar: ${regName}`;
            console.log(`[SCALESENDS-AUTO] Registrar assigned: ${regName}`);
          } else {
            console.log(`[SCALESENDS-AUTO] Set-registrar failed: HTTP ${setRes.status}`);
          }
        } else {
          console.log(`[SCALESENDS-AUTO] No available registrars for order ${orderId}`);
        }
      }
    }

    await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
      scalesends_status: "processing",
      scalesends_job_id: orderId,
      scalesends_submitted_at: new Date().toISOString(),
      scalesends_trigger_type: "auto",
      scalesends_inbox_count: mailboxCount || null,
      overall_status: "inboxes_creating",
    });

    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: "email_parsed",
      tenant_lifecycle_id: tenant.id,
      detail: `Auto-submitted to Scalesends. Order ID: ${orderId}. Domain: ${order?.domain || "pending"}${providerInfo}${registrarInfo}.`,
    });

    console.log(`[SCALESENDS-AUTO] Success! Order ${orderId} for ${tenant.ms_tenant_domain}`);
    return Response.json({ success: true, tenantId, orderId });
  } else {
    const errMsg = json?.error || json?.message || text.substring(0, 200) || `HTTP ${res.status}`;

    await base44.asServiceRole.entities.TenantLifecycle.update(tenant.id, {
      scalesends_status: "failed",
      scalesends_failure_reason: errMsg,
      scalesends_submitted_at: new Date().toISOString(),
      scalesends_trigger_type: "auto",
      scalesends_retry_count: (tenant.scalesends_retry_count || 0) + 1,
      overall_status: "scalesends_failed",
    });

    await base44.asServiceRole.entities.TenantAuditLog.create({
      action: "email_parsed",
      tenant_lifecycle_id: tenant.id,
      detail: `Auto-submit to Scalesends FAILED: ${errMsg}`,
    });

    console.log(`[SCALESENDS-AUTO] Failed: ${errMsg}`);
    return Response.json({ success: false, error: errMsg });
  }
});
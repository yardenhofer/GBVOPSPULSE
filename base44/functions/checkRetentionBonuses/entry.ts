import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Can be called by scheduled automation (no user) or admin manually
  let isManual = false;
  try {
    const user = await base44.auth.me();
    if (user && user.role === 'admin') isManual = true;
  } catch {}

  const today = new Date().toISOString().split("T")[0];
  const clients = await base44.asServiceRole.entities.Client.list("-created_date", 500);
  const existingBonuses = await base44.asServiceRole.entities.RetentionBonus.list("-created_date", 500);

  // Build set of client_ids that already have a bonus record
  const bonusedClientIds = new Set(existingBonuses.map(b => b.client_id));

  const created = [];

  for (const client of clients) {
    // Skip if already has a bonus record
    if (bonusedClientIds.has(client.id)) continue;

    // Must have a contract end date and min term
    if (!client.contract_end_date || !client.min_contract_months) continue;

    // Must still be active (not terminated/off-boarding)
    if (client.status === "Terminated" || client.status === "Off-Boarding") continue;

    // Check if contract end date has passed (client extended beyond minimum term)
    if (client.contract_end_date >= today) continue;

    // Client is past their minimum contract end date and still active — eligible for bonus
    const bonus = await base44.asServiceRole.entities.RetentionBonus.create({
      client_id: client.id,
      client_name: client.name,
      am_email: client.assigned_am || "",
      pm_email: client.assigned_pm || "",
      am_bonus_amount: 100,
      pm_bonus_amount: 50,
      min_contract_months: client.min_contract_months,
      contract_end_date: client.contract_end_date,
      detected_date: today,
      status: "pending",
    });

    created.push({
      client_name: client.name,
      am: client.assigned_am,
      pm: client.assigned_pm,
      contract_end_date: client.contract_end_date,
      bonusId: bonus.id,
    });
  }

  return Response.json({
    checked: clients.length,
    newBonuses: created.length,
    created,
  });
});
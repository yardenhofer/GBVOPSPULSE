import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Can be called by scheduled automation or admin manually
  let isManual = false;
  try {
    const user = await base44.auth.me();
    if (user && user.role === 'admin') isManual = true;
  } catch {}

  const today = new Date().toISOString().split("T")[0];
  const clients = await base44.asServiceRole.entities.Client.list("-created_date", 500);
  const existingBonuses = await base44.asServiceRole.entities.RetentionBonus.list("-created_date", 1000);

  // Build lookup: client_id -> Set of renewal_months already tracked
  const bonusMap = {};
  for (const b of existingBonuses) {
    if (!bonusMap[b.client_id]) bonusMap[b.client_id] = new Set();
    // Support old records without renewal_month (treat as month min+1)
    const month = b.renewal_month || (b.min_contract_months ? b.min_contract_months + 1 : null);
    if (month) bonusMap[b.client_id].add(month);
  }

  const created = [];

  for (const client of clients) {
    // Must have a start date and min contract months
    if (!client.start_date || !client.min_contract_months) continue;
    
    // Must still be active
    if (client.status === "Terminated" || client.status === "Off-Boarding") continue;

    const startDate = new Date(client.start_date + "T00:00:00Z");
    const minMonths = client.min_contract_months;

    // Calculate how many full months the client has been with us
    const now = new Date(today + "T00:00:00Z");
    let monthsElapsed = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
    // If current day hasn't reached start day yet, subtract one
    if (now.getDate() < startDate.getDate()) monthsElapsed--;
    if (monthsElapsed < 0) monthsElapsed = 0;

    // The first bonus-eligible month is minMonths + 1 (the first month beyond commitment)
    // For each month from minMonths+1 up to monthsElapsed+1, check if we need a bonus record
    const firstBonusMonth = minMonths + 1;
    // Current month the client is in (1-based): monthsElapsed + 1
    const currentMonth = monthsElapsed + 1;

    const existingMonths = bonusMap[client.id] || new Set();

    for (let m = firstBonusMonth; m <= currentMonth; m++) {
      if (existingMonths.has(m)) continue;

      // Calculate the due date for this month
      const dueDate = new Date(startDate);
      dueDate.setUTCMonth(dueDate.getUTCMonth() + m - 1);
      const dueDateStr = dueDate.toISOString().split("T")[0];

      // Only create if the due date is today or in the past
      if (dueDateStr > today) continue;

      const bonus = await base44.asServiceRole.entities.RetentionBonus.create({
        client_id: client.id,
        client_name: client.name,
        am_email: client.assigned_am || "",
        pm_email: client.assigned_pm || "",
        am_bonus_amount: 100,
        pm_bonus_amount: 50,
        min_contract_months: minMonths,
        renewal_month: m,
        renewal_due_date: dueDateStr,
        contract_end_date: client.contract_end_date || "",
        detected_date: today,
        status: "pending",
      });

      created.push({
        client_name: client.name,
        am: client.assigned_am,
        renewal_month: m,
        renewal_due_date: dueDateStr,
        bonusId: bonus.id,
      });

      existingMonths.add(m);
    }
  }

  return Response.json({
    checked: clients.length,
    newBonuses: created.length,
    created,
  });
});
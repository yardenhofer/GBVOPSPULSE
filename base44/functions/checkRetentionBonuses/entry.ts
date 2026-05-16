import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  const today = new Date().toISOString().split("T")[0];
  const clients = await base44.asServiceRole.entities.Client.list("-created_date", 500);
  const existingBonuses = await base44.asServiceRole.entities.RetentionBonus.list("-created_date", 1000);

  // Build lookup: client_id -> Set of renewal_months already tracked
  const bonusMap = {};
  for (const b of existingBonuses) {
    if (!bonusMap[b.client_id]) bonusMap[b.client_id] = new Set();
    const month = b.renewal_month || (b.min_contract_months ? b.min_contract_months + 1 : null);
    if (month) bonusMap[b.client_id].add(month);
  }

  const created = [];

  for (const client of clients) {
    if (!client.start_date || !client.min_contract_months) continue;
    if (client.status === "Terminated" || client.status === "Off-Boarding") continue;

    const startDate = new Date(client.start_date + "T00:00:00Z");
    const minMonths = client.min_contract_months;

    // Calculate how many full months the client has been with us
    const now = new Date(today + "T00:00:00Z");
    let monthsElapsed = (now.getFullYear() - startDate.getFullYear()) * 12 + (now.getMonth() - startDate.getMonth());
    if (now.getDate() < startDate.getDate()) monthsElapsed--;
    if (monthsElapsed < 0) monthsElapsed = 0;

    const currentMonth = monthsElapsed + 1;
    const existingMonths = bonusMap[client.id] || new Set();

    // First bonus: month minMonths + 1 (first month beyond contract)
    // Then every 3 months after that: minMonths+4, minMonths+7, minMonths+10, ...
    const firstBonusMonth = minMonths + 1;

    for (let m = firstBonusMonth; m <= currentMonth; m++) {
      // Only trigger at first renewal, then every 3 months after
      const monthsBeyondFirst = m - firstBonusMonth;
      if (monthsBeyondFirst !== 0 && monthsBeyondFirst % 3 !== 0) continue;

      if (existingMonths.has(m)) continue;

      const dueDate = new Date(startDate);
      dueDate.setUTCMonth(dueDate.getUTCMonth() + m - 1);
      const dueDateStr = dueDate.toISOString().split("T")[0];

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
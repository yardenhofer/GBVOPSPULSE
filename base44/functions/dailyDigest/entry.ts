import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow scheduled (no auth) or admin users
    let isScheduled = false;
    try {
      const user = await base44.auth.me();
      if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch {
      isScheduled = true;
    }

    let rawClients = await base44.asServiceRole.entities.Client.list('-updated_date', 200);
    if (typeof rawClients === 'string') try { rawClients = JSON.parse(rawClients); } catch(_) {}
    const clients = Array.isArray(rawClients) ? rawClients : (rawClients?.items || rawClients?.data || rawClients?.results || []);
    const today = new Date().toISOString().slice(0, 10);

    // Group clients by AM
    const amMap = {};
    for (const c of clients) {
      if (!c.assigned_am) continue;
      if (!amMap[c.assigned_am]) amMap[c.assigned_am] = [];
      amMap[c.assigned_am].push(c);
    }

    const results = [];

    for (const [amEmail, amClients] of Object.entries(amMap)) {
      const critical = amClients.filter(c => c.status === 'Critical' || c.is_escalated);
      const atRisk = amClients.filter(c => c.status === 'At Risk');
      const noTouchpoint = amClients.filter(c => {
        if (!c.last_am_touchpoint) return true;
        const days = Math.floor((new Date() - new Date(c.last_am_touchpoint)) / 86400000);
        return days >= 3;
      });
      const waitingLeads = amClients.filter(c => c.waiting_on_leads);

      // Build email body
      let body = `<h2 style="color:#1e293b">Good morning! Here's your daily client briefing for ${today}.</h2>`;
      body += `<p>You have <strong>${amClients.length} clients</strong> assigned to you.</p>`;

      if (critical.length > 0) {
        body += `<h3 style="color:#ef4444">🔴 Critical / Escalated (${critical.length})</h3><ul>`;
        critical.forEach(c => { body += `<li><strong>${c.name}</strong> — ${c.status}${c.is_escalated ? ' (ESCALATED)' : ''}</li>`; });
        body += `</ul>`;
      }

      if (atRisk.length > 0) {
        body += `<h3 style="color:#f97316">🟠 At Risk (${atRisk.length})</h3><ul>`;
        atRisk.forEach(c => { body += `<li><strong>${c.name}</strong></li>`; });
        body += `</ul>`;
      }

      if (noTouchpoint.length > 0) {
        body += `<h3 style="color:#eab308">⏰ No Recent Touchpoint (${noTouchpoint.length})</h3><ul>`;
        noTouchpoint.forEach(c => {
          const days = c.last_am_touchpoint
            ? Math.floor((new Date() - new Date(c.last_am_touchpoint)) / 86400000)
            : null;
          body += `<li><strong>${c.name}</strong>${days !== null ? ` — ${days} days ago` : ' — never'}</li>`;
        });
        body += `</ul>`;
      }

      if (waitingLeads.length > 0) {
        body += `<h3 style="color:#8b5cf6">📋 Waiting on Lead List (${waitingLeads.length})</h3><ul>`;
        waitingLeads.forEach(c => { body += `<li><strong>${c.name}</strong></li>`; });
        body += `</ul>`;
      }

      if (critical.length === 0 && atRisk.length === 0 && noTouchpoint.length === 0 && waitingLeads.length === 0) {
        body += `<p style="color:#22c55e">✅ All clients looking good today. Great work!</p>`;
      }

      body += `<hr/><p style="color:#94a3b8;font-size:12px">OpsControl Daily Digest · ${today}</p>`;

      await base44.asServiceRole.integrations.Core.SendEmail({
        to: amEmail,
        subject: `📋 Daily Briefing — ${today} (${critical.length + atRisk.length} need attention)`,
        body,
      });

      results.push({ am: amEmail, clients: amClients.length, critical: critical.length });
    }

    return Response.json({ success: true, sent: results.length, results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
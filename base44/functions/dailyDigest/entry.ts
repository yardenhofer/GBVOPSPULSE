import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// Emails of leadership who should receive the digest
// Must be registered app users for email delivery to work
const LEADERSHIP_EMAILS = [
  'yarden@growbigventures.com',
  'ibraheem@growbigventures.com',
  'zain@growbigventures.com',
  'yardenhofer@gmail.com', // fallback / owner account
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow scheduled (no auth) or admin
    try {
      const user = await base44.auth.me();
      if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch (_) { /* scheduled — ok */ }

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

    // ── Load all data in parallel ──
    const [rawClients, rawTasks, rawBonuses, rawCheckIns, rawAlerts, rawInsights] = await Promise.all([
      base44.asServiceRole.entities.Client.list('-updated_date', 300),
      base44.asServiceRole.entities.OpsTask.list('-created_date', 200),
      base44.asServiceRole.entities.RetentionBonus.list('-created_date', 100),
      base44.asServiceRole.entities.DailyCheckIn.list('-date', 200),
      base44.asServiceRole.entities.Alert.list('-triggered_date', 200),
      base44.asServiceRole.entities.SlackInsight.list('-analysis_date', 200),
    ]);

    function unwrap(raw) {
      if (Array.isArray(raw)) return raw;
      return raw?.items || raw?.data || raw?.results || [];
    }

    const clients = unwrap(rawClients).filter(c => c.status !== 'Terminated');
    const tasks = unwrap(rawTasks);
    const bonuses = unwrap(rawBonuses);
    const checkIns = unwrap(rawCheckIns);
    const alerts = unwrap(rawAlerts);
    const insights = unwrap(rawInsights);

    // ── Derived data ──
    const activeClients = clients.filter(c => c.status !== 'Off-Boarding');
    const critical = clients.filter(c => c.status === 'Critical' || c.is_escalated);
    const atRisk = clients.filter(c => c.status === 'At Risk');
    const monitor = clients.filter(c => c.status === 'Monitor');
    const healthy = clients.filter(c => c.status === 'Healthy');
    const offboarding = clients.filter(c => c.status === 'Off-Boarding');

    const todayCheckIns = checkIns.filter(ci => ci.date === today);
    const yesterdayCheckIns = checkIns.filter(ci => ci.date === yesterday);

    const openTasks = tasks.filter(t => t.status === 'open' || t.status === 'in_progress');
    const completedYesterday = tasks.filter(t => t.completed_at?.startsWith(yesterday));

    const pendingBonuses = bonuses.filter(b => b.status === 'pending');
    const activeAlerts = alerts.filter(a => a.is_active);

    const latestInsightByClient = {};
    for (const ins of insights) {
      if (!latestInsightByClient[ins.client_id]) latestInsightByClient[ins.client_id] = ins;
    }

    // ── Build rich context for AI ──
    const clientSummaries = activeClients.map(c => {
      const insight = latestInsightByClient[c.id];
      const daysSinceTouch = c.last_am_touchpoint
        ? Math.floor((Date.now() - new Date(c.last_am_touchpoint)) / 86400000)
        : null;
      const daysSinceReply = c.last_client_reply_date
        ? Math.floor((Date.now() - new Date(c.last_client_reply_date)) / 86400000)
        : null;
      const clientOpenTasks = openTasks.filter(t => t.client_id === c.id);
      return {
        name: c.name,
        status: c.status,
        package: c.package_type,
        am: c.assigned_am,
        pm: c.assigned_pm,
        revenue: c.revenue,
        sentiment: c.client_sentiment,
        leads_this_week: c.leads_this_week,
        target_leads_per_week: c.target_leads_per_week,
        leads_last_week: c.leads_last_week,
        escalated: c.is_escalated,
        waiting_on_leads: c.waiting_on_leads,
        days_since_am_touchpoint: daysSinceTouch,
        days_since_client_reply: daysSinceReply,
        open_ops_tasks: clientOpenTasks.length,
        slack_sentiment: insight?.sentiment,
        slack_summary: insight?.summary,
        slack_risk_signals: insight?.risk_signals,
        slack_upsell: insight?.upsell_opportunities,
        contract_end_date: c.contract_end_date,
      };
    });

    const checkInSummary = yesterdayCheckIns.map(ci => ({
      client: ci.client_name,
      am: ci.am_email,
      emails_sent: ci.emails_sent,
      leads: ci.leads_generated,
      satisfaction: ci.satisfaction_rate,
      notes: ci.notes,
    }));

    // ── AI Analysis ──
    console.log(`Calling AI with ${activeClients.length} clients, ${openTasks.length} open tasks, ${pendingBonuses.length} pending bonuses...`);

    const aiResult = await base44.asServiceRole.integrations.Core.InvokeLLM({
      model: 'claude_sonnet_4_6',
      prompt: `You are the chief operations analyst for GrowBig Ventures (GBV), a B2B lead generation agency. 
Write a daily digest report for the leadership team (Yarden, Ibraheem, Zain). 
Today is ${today}. Be concise, sharp, and actionable. Use emojis sparingly but effectively.

---
COMPANY DATA:
Total active clients: ${activeClients.length}
- Critical/Escalated: ${critical.length} clients: ${critical.map(c => c.name).join(', ') || 'none'}
- At Risk: ${atRisk.length} clients: ${atRisk.map(c => c.name).join(', ') || 'none'}
- Monitor: ${monitor.length} clients: ${monitor.map(c => c.name).join(', ') || 'none'}
- Healthy: ${healthy.length} clients
- Off-Boarding: ${offboarding.length} clients: ${offboarding.map(c => c.name).join(', ') || 'none'}

Total MRR: $${activeClients.reduce((s, c) => s + (c.revenue || 0), 0).toLocaleString()}
Revenue at risk (Critical + At Risk): $${[...critical, ...atRisk].reduce((s, c) => s + (c.revenue || 0), 0).toLocaleString()}

Open Ops Tasks: ${openTasks.length}
- Critical priority: ${openTasks.filter(t => t.priority === 'critical').length}
- High priority: ${openTasks.filter(t => t.priority === 'high').length}
Ops tasks completed yesterday: ${completedYesterday.length}

Pending retention bonuses awaiting approval: ${pendingBonuses.length}
Total pending bonus payout: $${pendingBonuses.reduce((s, b) => s + (b.am_bonus_amount || 0) + (b.pm_bonus_amount || 0), 0)}

Active alerts: ${activeAlerts.length}
- Red alerts: ${activeAlerts.filter(a => a.severity === 'Red').length}
- Yellow alerts: ${activeAlerts.filter(a => a.severity === 'Yellow').length}

Yesterday's check-ins submitted: ${yesterdayCheckIns.length} / ${activeClients.length} expected
Today's check-ins so far: ${todayCheckIns.length}

---
CLIENT DETAILS (all active clients):
${JSON.stringify(clientSummaries, null, 2)}

---
YESTERDAY'S CHECK-IN DATA:
${JSON.stringify(checkInSummary, null, 2)}

---
Write the report with these SECTIONS (use clear HTML headings, keep each section tight):
1. EXECUTIVE SUMMARY — 3-4 sentences covering the overall health of the business today. Mention MRR, biggest wins, biggest risks.
2. 🚨 URGENT ATTENTION — Clients needing immediate action today (Critical, escalated, or severe drops). Be specific about what's wrong.
3. 📊 PERFORMANCE SNAPSHOT — Lead generation performance vs targets across the book. Highlight over-performers and under-performers. Note any clients with 0 leads.
4. 💬 SENTIMENT & CLIENT HEALTH — Based on Slack data and check-ins, how are clients feeling? Flag any sentiment drops, risk signals, or upsell opportunities spotted.
5. ✅ OPS TASKS UPDATE — Open task backlog summary. What got done yesterday? What's still open and needs attention?
6. 📅 TODAY'S PRIORITIES — A crisp, ranked action list (max 5 items) for what the team should focus on today.
7. 💰 BONUS PIPELINE — Pending retention bonuses awaiting admin approval.

FORMAT: Return clean HTML suitable for email. Use tables where helpful. Keep it under 800 words total. No fluff.`,
      response_json_schema: {
        type: 'object',
        properties: {
          executive_summary: { type: 'string' },
          urgent_attention: { type: 'string' },
          performance_snapshot: { type: 'string' },
          sentiment_health: { type: 'string' },
          ops_tasks_update: { type: 'string' },
          todays_priorities: { type: 'string' },
          bonus_pipeline: { type: 'string' },
          subject_line: { type: 'string', description: 'Email subject line summarizing the day in one line' },
        },
      },
    });

    console.log('AI analysis complete, building email...');

    // ── Build HTML Email ──
    const totalMRR = activeClients.reduce((s, c) => s + (c.revenue || 0), 0);
    const revenueAtRisk = [...critical, ...atRisk].reduce((s, c) => s + (c.revenue || 0), 0);

    const urgencyColor = critical.length > 0 ? '#ef4444' : atRisk.length > 0 ? '#f97316' : '#22c55e';
    const urgencyLabel = critical.length > 0 ? `${critical.length} CRITICAL` : atRisk.length > 0 ? `${atRisk.length} AT RISK` : 'ALL CLEAR';

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; margin: 0; padding: 0; color: #1e293b; }
  .wrapper { max-width: 680px; margin: 0 auto; }
  .header { background: linear-gradient(135deg, #1e293b 0%, #334155 100%); color: white; padding: 28px 32px; }
  .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
  .header p { margin: 6px 0 0; font-size: 13px; color: #94a3b8; }
  .stat-bar { background: white; border-bottom: 1px solid #e2e8f0; padding: 16px 32px; display: flex; gap: 24px; }
  .stat { text-align: center; }
  .stat .val { font-size: 22px; font-weight: 700; line-height: 1; }
  .stat .lbl { font-size: 11px; color: #64748b; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.5px; }
  .body { padding: 24px 32px; background: #f8fafc; }
  .section { background: white; border: 1px solid #e2e8f0; border-radius: 10px; padding: 20px 24px; margin-bottom: 16px; }
  .section h2 { margin: 0 0 12px; font-size: 15px; font-weight: 700; color: #1e293b; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px; }
  .section p, .section li { font-size: 13.5px; line-height: 1.6; color: #334155; margin: 6px 0; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; }
  .badge-red { background: #fee2e2; color: #dc2626; }
  .badge-orange { background: #ffedd5; color: #ea580c; }
  .badge-yellow { background: #fef9c3; color: #ca8a04; }
  .badge-green { background: #dcfce7; color: #16a34a; }
  .urgency-banner { background: ${urgencyColor}15; border: 1px solid ${urgencyColor}40; border-radius: 8px; padding: 10px 16px; margin-bottom: 16px; text-align: center; font-weight: 700; color: ${urgencyColor}; font-size: 14px; }
  table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
  th { background: #f8fafc; padding: 6px 10px; text-align: left; color: #64748b; font-weight: 600; border-bottom: 1px solid #e2e8f0; }
  td { padding: 7px 10px; border-bottom: 1px solid #f1f5f9; color: #334155; }
  tr:last-child td { border-bottom: none; }
  .footer { padding: 20px 32px; text-align: center; font-size: 11px; color: #94a3b8; }
  ul { padding-left: 20px; }
  ol { padding-left: 20px; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>📊 GBV Daily Operations Digest</h1>
    <p>${today} · Prepared by AI Ops Analyst</p>
  </div>

  <div class="stat-bar">
    <div class="stat">
      <div class="val" style="color:#1e293b">${activeClients.length}</div>
      <div class="lbl">Active Clients</div>
    </div>
    <div class="stat">
      <div class="val" style="color:#1e293b">$${(totalMRR / 1000).toFixed(0)}k</div>
      <div class="lbl">Monthly MRR</div>
    </div>
    <div class="stat">
      <div class="val" style="color:#ef4444">${critical.length + atRisk.length}</div>
      <div class="lbl">Need Attention</div>
    </div>
    <div class="stat">
      <div class="val" style="color:#f97316">${openTasks.length}</div>
      <div class="lbl">Open Tasks</div>
    </div>
    <div class="stat">
      <div class="val" style="color:#8b5cf6">${pendingBonuses.length}</div>
      <div class="lbl">Pending Bonuses</div>
    </div>
  </div>

  <div class="body">
    ${critical.length > 0 || atRisk.length > 0 ? `<div class="urgency-banner">⚠️ ${urgencyLabel} — Revenue at risk: $${revenueAtRisk.toLocaleString()}/mo</div>` : `<div class="urgency-banner" style="background:#dcfce715;border-color:#22c55e40;color:#16a34a">✅ ${urgencyLabel} — Business healthy</div>`}

    <div class="section">
      <h2>📋 Executive Summary</h2>
      ${aiResult.executive_summary}
    </div>

    ${(critical.length > 0 || atRisk.length > 0 || openTasks.filter(t => t.priority === 'critical').length > 0) ? `
    <div class="section" style="border-color:#fca5a5">
      <h2>🚨 Urgent Attention Required</h2>
      ${aiResult.urgent_attention}
    </div>` : ''}

    <div class="section">
      <h2>📊 Performance Snapshot</h2>
      ${aiResult.performance_snapshot}
    </div>

    <div class="section">
      <h2>💬 Sentiment & Client Health</h2>
      ${aiResult.sentiment_health}
    </div>

    <div class="section">
      <h2>✅ Ops Tasks Update</h2>
      ${aiResult.ops_tasks_update}
    </div>

    <div class="section" style="border-color:#93c5fd; background: #eff6ff08;">
      <h2>📅 Today's Priorities</h2>
      ${aiResult.todays_priorities}
    </div>

    ${pendingBonuses.length > 0 ? `
    <div class="section">
      <h2>💰 Bonus Pipeline (${pendingBonuses.length} pending)</h2>
      ${aiResult.bonus_pipeline}
      <table style="margin-top:10px">
        <tr><th>Client</th><th>Month</th><th>AM</th><th>AM Bonus</th><th>PM Bonus</th></tr>
        ${pendingBonuses.slice(0, 10).map(b => `
          <tr>
            <td>${b.client_name}</td>
            <td>Month ${b.renewal_month}</td>
            <td>${b.am_email || '—'}</td>
            <td>$${b.am_bonus_amount || 100}</td>
            <td>$${b.pm_bonus_amount || 50}</td>
          </tr>`).join('')}
      </table>
    </div>` : ''}

  </div>
  <div class="footer">
    GrowBig Ventures · AI Ops Digest · ${today}<br>
    <span style="color:#cbd5e1">This report is AI-generated from live dashboard data.</span>
  </div>
</div>
</body>
</html>`;

    // ── Determine registered recipients ──
    const rawUsers = await base44.asServiceRole.entities.User.list('-created_date', 200);
    const appUsers = unwrap(rawUsers);
    const appUserEmails = new Set(appUsers.map(u => u.email?.toLowerCase()).filter(Boolean));

    const subject = aiResult.subject_line || `GBV Daily Digest — ${today} · ${critical.length + atRisk.length} need attention`;

    // Send email only to recipients who are registered app users
    const emailRecipients = LEADERSHIP_EMAILS.filter(e => appUserEmails.has(e.toLowerCase()));
    console.log(`Registered recipients: ${emailRecipients.join(', ')}`);

    const emailResults = await Promise.allSettled(
      emailRecipients.map(to =>
        base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body: html })
      )
    );

    // Also post a Slack summary to the ops alerts channel
    const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL_OPS_ALERTS') || Deno.env.get('SLACK_WEBHOOK_URL');
    if (slackWebhookUrl) {
      const priorities = aiResult.todays_priorities
        ? aiResult.todays_priorities.replace(/<[^>]+>/g, '').trim().slice(0, 400)
        : '';
      const slackMsg = {
        text: `📊 *GBV Daily Digest — ${today}*`,
        blocks: [
          {
            type: 'header',
            text: { type: 'plain_text', text: `📊 GBV Daily Digest — ${today}`, emoji: true },
          },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Active Clients*\n${activeClients.length}` },
              { type: 'mrkdwn', text: `*Monthly MRR*\n$${totalMRR.toLocaleString()}` },
              { type: 'mrkdwn', text: `*Need Attention*\n${critical.length + atRisk.length} (${critical.length} critical, ${atRisk.length} at risk)` },
              { type: 'mrkdwn', text: `*Open Tasks*\n${openTasks.length} (${openTasks.filter(t => t.priority === 'critical').length} critical)` },
              { type: 'mrkdwn', text: `*Revenue at Risk*\n$${revenueAtRisk.toLocaleString()}/mo` },
              { type: 'mrkdwn', text: `*Pending Bonuses*\n${pendingBonuses.length} awaiting approval` },
            ],
          },
          ...(critical.length > 0 ? [{
            type: 'section',
            text: { type: 'mrkdwn', text: `🚨 *CRITICAL:* ${critical.map(c => c.name).join(', ')}` },
          }] : []),
          ...(atRisk.length > 0 ? [{
            type: 'section',
            text: { type: 'mrkdwn', text: `🟠 *At Risk:* ${atRisk.map(c => c.name).join(', ')}` },
          }] : []),
          ...(priorities ? [{
            type: 'section',
            text: { type: 'mrkdwn', text: `*📅 Today's Priorities:*\n${priorities}` },
          }] : []),
          {
            type: 'context',
            elements: [{ type: 'mrkdwn', text: `AI-generated digest · ${emailRecipients.length} email(s) sent` }],
          },
        ],
      };

      try {
        await fetch(slackWebhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(slackMsg),
        });
        console.log('Slack digest posted successfully');
      } catch (slackErr) {
        console.error('Slack post failed:', slackErr.message);
      }
    }

    const emailSent = emailResults.filter(r => r.status === 'fulfilled').length;
    const emailFailed = emailResults.filter(r => r.status === 'rejected').length;
    console.log(`Email: ${emailSent} sent, ${emailFailed} failed`);

    return Response.json({
      success: true,
      email_recipients: emailRecipients,
      emails_sent: emailSent,
      emails_failed: emailFailed,
      slack_posted: !!slackWebhookUrl,
      subject,
      stats: {
        active_clients: activeClients.length,
        critical: critical.length,
        at_risk: atRisk.length,
        open_tasks: openTasks.length,
        pending_bonuses: pendingBonuses.length,
        total_mrr: totalMRR,
        revenue_at_risk: revenueAtRisk,
      },
    });

  } catch (error) {
    console.error('Daily digest error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
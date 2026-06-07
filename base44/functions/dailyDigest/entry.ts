import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

const LEADERSHIP_EMAILS = [
  'yarden@growbigventures.com',
  'ibraheem@growbigventures.com',
  'zain@growbigventures.com',
  'yardenhofer@gmail.com',
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    try {
      const user = await base44.auth.me();
      if (user?.role !== 'admin') {
        return Response.json({ error: 'Forbidden' }, { status: 403 });
      }
    } catch (_) { /* scheduled — ok */ }

    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

    // ── Load all data ──
    const [rawClients, rawTasks, rawBonuses, rawCheckIns, rawAlerts, rawInsights, rawActivityLogs] = await Promise.all([
      base44.asServiceRole.entities.Client.list('-updated_date', 300),
      base44.asServiceRole.entities.OpsTask.list('-created_date', 500),
      base44.asServiceRole.entities.RetentionBonus.list('-created_date', 100),
      base44.asServiceRole.entities.DailyCheckIn.list('-date', 300),
      base44.asServiceRole.entities.Alert.list('-triggered_date', 300),
      base44.asServiceRole.entities.SlackInsight.list('-analysis_date', 300),
      base44.asServiceRole.entities.ActivityLog.list('-date', 300),
    ]);

    function unwrap(r) {
      return Array.isArray(r) ? r : (r?.items || r?.data || r?.results || []);
    }

    const clients = unwrap(rawClients).filter(c => c.status !== 'Terminated');
    const tasks = unwrap(rawTasks);
    const bonuses = unwrap(rawBonuses);
    const checkIns = unwrap(rawCheckIns);
    const alerts = unwrap(rawAlerts);
    const insights = unwrap(rawInsights);
    const activityLogs = unwrap(rawActivityLogs);

    // Derived
    const activeClients = clients.filter(c => c.status !== 'Off-Boarding');
    const critical = clients.filter(c => c.status === 'Critical' || c.is_escalated);
    const atRisk = clients.filter(c => c.status === 'At Risk');
    const monitor = clients.filter(c => c.status === 'Monitor');
    const healthy = clients.filter(c => c.status === 'Healthy');
    const offboarding = clients.filter(c => c.status === 'Off-Boarding');
    const openTasks = tasks.filter(t => t.status === 'open' || t.status === 'in_progress');
    const completedYesterday = tasks.filter(t => t.completed_at?.startsWith(yesterday));
    const pendingBonuses = bonuses.filter(b => b.status === 'pending');
    const activeAlerts = alerts.filter(a => a.is_active);
    const yesterdayCheckIns = checkIns.filter(ci => ci.date === yesterday);
    const totalMRR = activeClients.reduce((s, c) => s + (c.revenue || 0), 0);
    const revenueAtRisk = [...critical, ...atRisk].reduce((s, c) => s + (c.revenue || 0), 0);

    // Build lookup maps
    const insightMap = {};
    for (const ins of insights) {
      if (!insightMap[ins.client_id]) insightMap[ins.client_id] = ins;
    }
    const tasksByClient = {};
    for (const t of tasks) {
      if (!tasksByClient[t.client_id]) tasksByClient[t.client_id] = [];
      tasksByClient[t.client_id].push(t);
    }
    const alertsByClient = {};
    for (const a of alerts) {
      if (!alertsByClient[a.client_id]) alertsByClient[a.client_id] = [];
      alertsByClient[a.client_id].push(a);
    }
    const recentCIByClient = {};
    for (const ci of checkIns) {
      if (!recentCIByClient[ci.client_id]) recentCIByClient[ci.client_id] = ci;
    }
    const recentActivityByClient = {};
    for (const a of activityLogs) {
      if (!recentActivityByClient[a.client_id]) recentActivityByClient[a.client_id] = a;
    }

    // Build per-client profile (compact)
    function buildProfile(c) {
      const ins = insightMap[c.id];
      const clientTasks = tasksByClient[c.id] || [];
      const clientAlerts = (alertsByClient[c.id] || []).filter(a => a.is_active);
      const recentCI = recentCIByClient[c.id];
      const recentAct = recentActivityByClient[c.id];
      const daysSinceTouch = c.last_am_touchpoint ? Math.floor((Date.now() - new Date(c.last_am_touchpoint)) / 86400000) : null;
      const daysSinceReply = c.last_client_reply_date ? Math.floor((Date.now() - new Date(c.last_client_reply_date)) / 86400000) : null;
      const openCT = clientTasks.filter(t => t.status === 'open' || t.status === 'in_progress');
      const leadsTarget = c.target_leads_per_week || 0;
      const leadsW1 = c.leads_this_week || 0;
      const leadsW2 = c.leads_last_week || 0;
      const leadsW3 = c.leads_week_3 || 0;
      const leadsW4 = c.leads_week_4 || 0;
      const daysUntilEnd = c.contract_end_date ? Math.floor((new Date(c.contract_end_date) - Date.now()) / 86400000) : null;

      return {
        name: c.name,
        status: c.status,
        pkg: c.package_type,
        am: c.assigned_am?.split('@')[0],
        rev: `$${c.revenue || 0}`,
        sentiment: c.client_sentiment,
        slack_sentiment: ins?.sentiment,
        slack_trend: ins?.sentiment_trend,
        slack_summary: ins?.summary ? ins.summary.slice(0, 200) : null,
        slack_risks: ins?.risk_signals ? ins.risk_signals.slice(0, 150) : null,
        slack_upsell: ins?.upsell_opportunities ? ins.upsell_opportunities.slice(0, 100) : null,
        leads: `${leadsW1}/${leadsTarget || '?'} (W2:${leadsW2} W3:${leadsW3} W4:${leadsW4})`,
        meetings: c.meetings_booked || 0,
        touch_days: daysSinceTouch,
        reply_days: daysSinceReply,
        open_tasks: openCT.length,
        task_list: openCT.slice(0, 3).map(t => `[${t.priority}] ${t.task_type}: ${(t.description || t.trigger_detail || '').slice(0, 80)}`),
        alerts: clientAlerts.slice(0, 3).map(a => `${a.severity}: ${a.message.slice(0, 80)}`),
        contract_days: daysUntilEnd,
        stage: c.onboarding_stage,
        escalated: c.is_escalated || false,
        waiting_leads: c.waiting_on_leads || false,
        inbox_pct: c.instantly_cache_pct,
        notes: c.notes ? c.notes.slice(0, 150) : null,
        feedback: c.client_feedback ? c.client_feedback.slice(0, 150) : null,
        last_ci_notes: recentCI?.notes ? recentCI.notes.slice(0, 100) : null,
        last_activity: recentAct ? `${recentAct.type}: ${recentAct.note?.slice(0, 100)}` : null,
      };
    }

    // Sort by urgency then revenue
    const statusOrder = { Critical: 0, 'At Risk': 1, Monitor: 2, 'Off-Boarding': 3, Healthy: 4 };
    const sortedClients = [...clients].sort((a, b) => {
      const so = (statusOrder[a.status] ?? 5) - (statusOrder[b.status] ?? 5);
      return so !== 0 ? so : (b.revenue || 0) - (a.revenue || 0);
    });

    // Split into urgent (critical/at-risk/monitor/escalated) vs healthy for separate AI calls
    const urgentClients = sortedClients.filter(c => ['Critical', 'At Risk', 'Monitor'].includes(c.status) || c.is_escalated || c.status === 'Off-Boarding');
    const healthyClients = sortedClients.filter(c => c.status === 'Healthy' && !c.is_escalated);

    const urgentProfiles = urgentClients.map(buildProfile);
    const healthyProfiles = healthyClients.map(buildProfile);

    console.log(`Running AI — ${urgentClients.length} urgent, ${healthyClients.length} healthy, ${openTasks.length} tasks...`);

    const companyContext = `
TODAY: ${today}
COMPANY: ${activeClients.length} active clients | MRR: $${totalMRR.toLocaleString()} | At-risk revenue: $${revenueAtRisk.toLocaleString()}
STATUS: ${critical.length} Critical, ${atRisk.length} At Risk, ${monitor.length} Monitor, ${healthy.length} Healthy, ${offboarding.length} Off-Boarding
TASKS: ${openTasks.length} open (${openTasks.filter(t=>t.priority==='critical').length} critical) | ${completedYesterday.length} completed yesterday
ALERTS: ${activeAlerts.length} active (${activeAlerts.filter(a=>a.severity==='Red').length} red)
CHECK-INS: ${yesterdayCheckIns.length}/${activeClients.length} submitted yesterday
BONUSES: ${pendingBonuses.length} pending ($${pendingBonuses.reduce((s,b)=>s+(b.am_bonus_amount||0)+(b.pm_bonus_amount||0),0)} total)`;

    // Run both AI calls in parallel
    const [urgentAI, healthyAI] = await Promise.all([
      base44.asServiceRole.integrations.Core.InvokeLLM({
        model: 'claude_sonnet_4_6',
        prompt: `You are the chief ops analyst at GrowBig Ventures (GBV), a B2B lead gen agency.
${companyContext}

Write a DEEP-DIVE briefing for leadership (Yarden, Ibraheem, Zain). No fluff. Be specific, factual, and direct.

URGENT/WATCH CLIENTS DATA:
${JSON.stringify(urgentProfiles, null, 1)}

OPEN OPS TASKS (top 20):
${JSON.stringify(openTasks.slice(0, 20).map(t => ({ client: t.client_name, priority: t.priority, type: t.task_type, desc: (t.description || t.trigger_detail || '').slice(0, 100), status: t.status, assigned: t.assigned_to?.split('@')[0] })), null, 1)}

COMPLETED YESTERDAY:
${JSON.stringify(completedYesterday.slice(0, 10).map(t => ({ client: t.client_name, type: t.task_type, feedback: (t.feedback || '').slice(0, 100) })), null, 1)}

PENDING BONUSES:
${JSON.stringify(pendingBonuses.map(b => ({ client: b.client_name, month: b.renewal_month, am: b.am_email?.split('@')[0], am_bonus: b.am_bonus_amount, pm_bonus: b.pm_bonus_amount })), null, 1)}

Write HTML sections (no doctype/head/body/style tags — just the content divs):

1. <div id="briefing"> — LEADERSHIP BRIEFING: 3-4 sentences on overall business state. MRR, biggest threats, overall sentiment trend.

2. <div id="urgent"> — URGENT CLIENTS: For EACH urgent/watch client, write a detailed block:
   - Client name + status badge + revenue + AM
   - Lead performance (specific numbers vs target, trend over 4 weeks)
   - Sentiment: what dashboard says vs what Slack analysis shows. Quote any notable client sentiment or risk signals.
   - Days since last AM touchpoint and client reply
   - Open ops tasks listed out
   - Contract renewal if <90 days
   - ACTION NEEDED: exactly what the team needs to do today for this client (be specific, not generic)
   
3. <div id="tasks"> — OPS TASKS ROUNDUP:
   - What was completed yesterday (list with client names and what was done)
   - What's still open by priority (critical → high → medium)
   - Flag any tasks stale >5 days
   
4. <div id="priorities"> — TODAY'S TOP 5: Ranked specific actions. Name clients. Be direct.

5. <div id="bonuses"> — BONUS PIPELINE: Table of pending bonuses.

Use HTML tables, badges, and clear formatting. Be comprehensive but scannable.`,
        response_json_schema: {
          type: 'object',
          properties: {
            subject_line: { type: 'string' },
            briefing: { type: 'string' },
            urgent_clients: { type: 'string' },
            tasks_roundup: { type: 'string' },
            priorities: { type: 'string' },
            bonuses: { type: 'string' },
          },
        },
      }),

      base44.asServiceRole.integrations.Core.InvokeLLM({
        model: 'claude_sonnet_4_6',
        prompt: `You are the chief ops analyst at GrowBig Ventures (GBV). Today is ${today}.

These are the HEALTHY clients. Write a concise status update for each. Be direct and factual.

HEALTHY CLIENT DATA (${healthyProfiles.length} clients):
${JSON.stringify(healthyProfiles, null, 1)}

Generate an HTML table with one row per client. Columns:
Client | AM | Package | Revenue | Leads (W1/Target) | 4-Week Trend | Sentiment | Slack Insight | Touchpoint | Status / Note

- Leads trend: use ↑↓→ symbols
- Sentiment: combine dashboard + Slack sentiment concisely
- Status/Note: 1 sentence — is this client fine, needs watch, or has an upsell opportunity?
- Use inline badge styles for sentiments: happy=green, neutral=gray, concerned=yellow, unhappy=red

Below the table, add a brief "⚠️ Watch List" paragraph listing any healthy clients that are trending down on leads, haven't had AM contact in >7 days, or have notable risk signals from Slack.

Return a single HTML string (no doctype/head/body tags) as "healthy_clients".`,
        response_json_schema: {
          type: 'object',
          properties: {
            healthy_clients: { type: 'string' },
          },
        },
      }),
    ]);

    console.log('Both AI calls complete, building email...');

    // ── Build HTML Email ──
    const urgencyColor = critical.length > 0 ? '#ef4444' : atRisk.length > 0 ? '#f97316' : '#22c55e';
    const urgencyLabel = critical.length > 0 ? `${critical.length} CRITICAL` : atRisk.length > 0 ? `${atRisk.length} AT RISK` : 'ALL CLEAR';

    const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f8fafc;margin:0;padding:0;color:#1e293b}
  .wrapper{max-width:760px;margin:0 auto}
  .header{background:linear-gradient(135deg,#1e293b 0%,#334155 100%);color:white;padding:28px 32px}
  .header h1{margin:0;font-size:22px;font-weight:700;letter-spacing:-.5px}
  .header p{margin:6px 0 0;font-size:13px;color:#94a3b8}
  .stat-bar{background:white;border-bottom:2px solid #e2e8f0;padding:16px 32px;display:flex;gap:0}
  .stat{text-align:center;flex:1;border-right:1px solid #e2e8f0;padding:0 8px}
  .stat:last-child{border-right:none}
  .stat .val{font-size:22px;font-weight:800;line-height:1}
  .stat .lbl{font-size:10px;color:#64748b;margin-top:3px;text-transform:uppercase;letter-spacing:.5px}
  .body{padding:24px 32px;background:#f8fafc}
  .section{background:white;border:1px solid #e2e8f0;border-radius:10px;padding:20px 24px;margin-bottom:16px}
  .section h2{margin:0 0 14px;font-size:16px;font-weight:700;color:#1e293b;border-bottom:2px solid #f1f5f9;padding-bottom:10px}
  .section h3{margin:16px 0 6px;font-size:13px;font-weight:700;color:#475569;text-transform:uppercase;letter-spacing:.5px}
  .section p,.section li{font-size:13.5px;line-height:1.65;color:#334155;margin:5px 0}
  .badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700}
  .badge-red{background:#fee2e2;color:#dc2626}
  .badge-orange{background:#ffedd5;color:#ea580c}
  .badge-yellow{background:#fef9c3;color:#ca8a04}
  .badge-green{background:#dcfce7;color:#16a34a}
  .badge-purple{background:#f3e8ff;color:#9333ea}
  .badge-blue{background:#dbeafe;color:#2563eb}
  .banner{border-radius:8px;padding:10px 16px;margin-bottom:16px;text-align:center;font-weight:700;font-size:14px;background:${urgencyColor}15;border:1px solid ${urgencyColor}40;color:${urgencyColor}}
  table{width:100%;border-collapse:collapse;font-size:12.5px}
  th{background:#f1f5f9;padding:7px 10px;text-align:left;color:#475569;font-weight:700;border-bottom:2px solid #e2e8f0;font-size:11px;text-transform:uppercase;letter-spacing:.4px}
  td{padding:8px 10px;border-bottom:1px solid #f1f5f9;color:#334155;vertical-align:top}
  tr:last-child td{border-bottom:none}
  .client-block{border:1px solid #e2e8f0;border-radius:8px;padding:14px 16px;margin-bottom:12px}
  .action-box{background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:8px 12px;margin-top:10px;font-size:12.5px;font-weight:600;color:#92400e}
  .footer{padding:20px 32px;text-align:center;font-size:11px;color:#94a3b8}
  ul{padding-left:18px;margin:6px 0}
  ol{padding-left:18px;margin:6px 0}
  strong{color:#1e293b}
  hr{border:none;border-top:1px solid #f1f5f9;margin:14px 0}
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>📋 GBV Daily Deep-Dive Briefing</h1>
    <p>${today} · Full client-by-client update · ${clients.length} clients covered</p>
  </div>

  <div class="stat-bar">
    <div class="stat"><div class="val">${activeClients.length}</div><div class="lbl">Active</div></div>
    <div class="stat"><div class="val">$${(totalMRR/1000).toFixed(0)}k</div><div class="lbl">MRR</div></div>
    <div class="stat"><div class="val" style="color:${critical.length>0?'#ef4444':'#94a3b8'}">${critical.length}</div><div class="lbl">Critical</div></div>
    <div class="stat"><div class="val" style="color:${atRisk.length>0?'#f97316':'#94a3b8'}">${atRisk.length}</div><div class="lbl">At Risk</div></div>
    <div class="stat"><div class="val" style="color:#eab308">${monitor.length}</div><div class="lbl">Monitor</div></div>
    <div class="stat"><div class="val" style="color:#22c55e">${healthy.length}</div><div class="lbl">Healthy</div></div>
    <div class="stat"><div class="val" style="color:#f97316">${openTasks.length}</div><div class="lbl">Tasks</div></div>
  </div>

  <div class="body">
    <div class="banner">
      ${critical.length > 0 || atRisk.length > 0
        ? `⚠️ ${urgencyLabel} — $${revenueAtRisk.toLocaleString()}/mo at risk`
        : `✅ ${urgencyLabel} — No critical or at-risk clients`}
    </div>

    <!-- LEADERSHIP BRIEFING -->
    <div class="section">
      <h2>📋 Leadership Briefing</h2>
      ${urgentAI.briefing || ''}
    </div>

    <!-- URGENT CLIENTS -->
    ${urgentClients.length > 0 ? `
    <div class="section" style="border-color:#fca5a5">
      <h2>🔥 Clients Needing Attention (${urgentClients.length})</h2>
      ${urgentAI.urgent_clients || ''}
    </div>` : ''}

    <!-- HEALTHY CLIENTS -->
    <div class="section">
      <h2>✅ Healthy Clients (${healthyClients.length})</h2>
      ${healthyAI.healthy_clients || ''}
    </div>

    <!-- OPS TASKS -->
    <div class="section">
      <h2>🛠️ Ops Tasks Roundup</h2>
      ${urgentAI.tasks_roundup || ''}
    </div>

    <!-- PRIORITIES -->
    <div class="section" style="border-color:#93c5fd;background:#eff6ff08">
      <h2>📅 Today's Top 5 Priorities</h2>
      ${urgentAI.priorities || ''}
    </div>

    <!-- BONUSES -->
    ${pendingBonuses.length > 0 ? `
    <div class="section">
      <h2>💰 Bonus Pipeline (${pendingBonuses.length} pending)</h2>
      ${urgentAI.bonuses || ''}
    </div>` : ''}

  </div>
  <div class="footer">
    GrowBig Ventures · Daily Deep-Dive · ${today}<br>
    <span style="color:#cbd5e1">AI-generated from live dashboard data · ${clients.length} clients analyzed</span>
  </div>
</div>
</body>
</html>`;

    // ── Send emails ──
    const rawUsers = await base44.asServiceRole.entities.User.list('-created_date', 200);
    const appUsers = unwrap(rawUsers);
    const appUserEmails = new Set(appUsers.map(u => u.email?.toLowerCase()).filter(Boolean));
    const subject = urgentAI.subject_line || `GBV Daily Briefing — ${today} · ${clients.length} clients`;
    const emailRecipients = LEADERSHIP_EMAILS.filter(e => appUserEmails.has(e.toLowerCase()));

    const emailResults = await Promise.allSettled(
      emailRecipients.map(to => base44.asServiceRole.integrations.Core.SendEmail({ to, subject, body: html }))
    );

    // ── Slack summary ──
    const slackUrl = Deno.env.get('SLACK_WEBHOOK_URL_OPS_ALERTS') || Deno.env.get('SLACK_WEBHOOK_URL');
    if (slackUrl) {
      const urgentNames = [...critical, ...atRisk].map(c => c.name);
      const slackMsg = {
        text: `📋 *GBV Daily Briefing — ${today}*`,
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: `📋 GBV Daily Briefing — ${today}`, emoji: true } },
          {
            type: 'section',
            fields: [
              { type: 'mrkdwn', text: `*Active Clients*\n${activeClients.length}` },
              { type: 'mrkdwn', text: `*MRR*\n$${totalMRR.toLocaleString()}` },
              { type: 'mrkdwn', text: `*Needs Attention*\n${critical.length + atRisk.length} clients` },
              { type: 'mrkdwn', text: `*Revenue at Risk*\n$${revenueAtRisk.toLocaleString()}` },
              { type: 'mrkdwn', text: `*Open Tasks*\n${openTasks.length}` },
              { type: 'mrkdwn', text: `*Monitor*\n${monitor.length} clients` },
            ],
          },
          ...(urgentNames.length > 0 ? [{ type: 'section', text: { type: 'mrkdwn', text: `🚨 *Needs action:* ${urgentNames.join(', ')}` } }] : []),
          { type: 'context', elements: [{ type: 'mrkdwn', text: `Full deep-dive emailed to ${emailRecipients.length} recipient(s)` }] },
        ],
      };
      try {
        await fetch(slackUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(slackMsg) });
      } catch (e) { console.error('Slack failed:', e.message); }
    }

    const emailSent = emailResults.filter(r => r.status === 'fulfilled').length;
    console.log(`Done — ${emailSent} emails sent`);

    return Response.json({
      success: true,
      email_recipients: emailRecipients,
      emails_sent: emailSent,
      subject,
      stats: { active_clients: activeClients.length, critical: critical.length, at_risk: atRisk.length, open_tasks: openTasks.length, total_mrr: totalMRR },
    });

  } catch (error) {
    console.error('Daily digest error:', error.message);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
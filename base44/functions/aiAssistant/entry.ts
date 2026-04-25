import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { message, conversationHistory } = await req.json();

    // Fetch all data in parallel
    const [
      clients,
      alerts,
      dailyCheckIns,
      activityLogs,
      leadLists,
      leadListApprovals,
      recoveryPlans,
      slackInsights,
      heyReachCache,
      infraSnapshots,
    ] = await Promise.all([
      base44.asServiceRole.entities.Client.list('-updated_date', 200),
      base44.asServiceRole.entities.Alert.list('-created_date', 100),
      base44.asServiceRole.entities.DailyCheckIn.list('-date', 200),
      base44.asServiceRole.entities.ActivityLog.list('-date', 100),
      base44.asServiceRole.entities.LeadList.list('-created_date', 100),
      base44.asServiceRole.entities.LeadListApproval.list('-created_date', 50),
      base44.asServiceRole.entities.RecoveryPlan.list('-created_date', 50),
      base44.asServiceRole.entities.SlackInsight.list('-analysis_date', 100),
      base44.asServiceRole.entities.HeyReachCache.list('-synced_at', 20),
      base44.asServiceRole.entities.InfraHealthSnapshot.list('-date', 50),
    ]);

    // Build a concise data summary for the LLM
    const activeClients = clients.filter(c => c.status !== 'Terminated');
    const terminatedClients = clients.filter(c => c.status === 'Terminated');
    const activeAlerts = alerts.filter(a => a.is_active);

    // Build client summaries (compact)
    const clientSummaries = activeClients.map(c => ({
      id: c.id,
      name: c.name,
      status: c.status,
      status_override: c.status_override || null,
      sentiment: c.client_sentiment,
      package: c.package_type,
      group: c.group,
      am: c.assigned_am,
      revenue: c.revenue,
      start_date: c.start_date,
      contract_end: c.contract_end_date,
      target_leads_wk: c.target_leads_per_week,
      leads_this_wk: c.leads_this_week,
      leads_last_wk: c.leads_last_week,
      leads_wk3: c.leads_week_3,
      leads_wk4: c.leads_week_4,
      meetings_booked: c.meetings_booked,
      waiting_on_leads: c.waiting_on_leads,
      waiting_since: c.waiting_since,
      last_touchpoint: c.last_am_touchpoint,
      last_client_reply: c.last_client_reply_date,
      is_escalated: c.is_escalated,
      onboarding_stage: c.onboarding_stage,
      instantly_connected: !!c.instantly_api_key,
      instantly_seq_pct: c.instantly_cache_pct,
      instantly_no_active: c.instantly_cache_no_active,
      instantly_error: c.instantly_cache_error,
      slack_channel: c.slack_channel_name || c.slack_channel_id,
    }));

    // Recent check-ins (last 7 days)
    const recentCheckIns = dailyCheckIns.slice(0, 100).map(ci => ({
      client: ci.client_name,
      date: ci.date,
      am: ci.am_email,
      leads: ci.leads_generated,
      emails_sent: ci.emails_sent,
      inmails_sent: ci.inmails_sent,
      completed: ci.completed,
    }));

    // Slack insights
    const slackSummaries = slackInsights.map(si => ({
      client: si.client_name,
      sentiment: si.sentiment,
      score: si.sentiment_score,
      trend: si.sentiment_trend,
      summary: si.summary,
      risks: si.risk_signals,
      upsell: si.upsell_opportunities,
      date: si.analysis_date,
    }));

    // HeyReach data summaries
    const heyReachSummaries = heyReachCache.map(hr => {
      try {
        const data = JSON.parse(hr.workspace_data || '[]');
        return {
          days: hr.days,
          client: hr.client_name,
          synced: hr.synced_at,
          workspaces: data.length,
        };
      } catch {
        return { days: hr.days, client: hr.client_name, synced: hr.synced_at };
      }
    });

    // Infra health
    const infraSummaries = infraSnapshots.slice(0, 30).map(s => ({
      client: s.client_name,
      date: s.date,
      total_accounts: s.total_accounts,
      error_accounts: s.error_accounts,
      error_pct: s.error_pct,
    }));

    // Lead list approvals
    const approvalSummaries = leadListApprovals.map(a => ({
      client: a.client_name,
      list: a.list_name,
      status: a.status,
      submitted_by: a.submitted_by_name || a.submitted_by,
      ai_score: a.ai_score,
      ai_recommendation: a.ai_recommendation,
      date: a.created_date,
    }));

    const today = new Date().toISOString().split('T')[0];

    const systemPrompt = `You are the AI Operations Advisor for GBV (Grow Big Ventures), an outbound lead generation agency. You have access to ALL operational data across the business. Your job is to:

1. **Find Data Inconsistencies & Logical Errors**: Spot things like:
   - Clients marked "Healthy" but with 0 leads for multiple weeks
   - Clients with high sequence completion % (>80%) who haven't gotten new lead lists
   - Sentiment mismatches (e.g. Slack insight says "Unhappy" but status is "Healthy")
   - Missing data (no check-ins, no touchpoints for active clients)
   - Clients waiting on leads for too long
   - Status overrides that may no longer be appropriate
   - Escalated clients without recovery plans
   - Contract end dates approaching without action

2. **Strategic Recommendations**: Provide actionable insights like:
   - Which clients need immediate attention and why
   - Upsell opportunities based on performance
   - AM workload distribution issues
   - Lead pipeline health across the portfolio
   - Infrastructure health concerns (Instantly inbox errors)
   - LinkedIn/HeyReach campaign performance patterns

3. **Answer Questions**: The user can ask anything about their operations data.

TODAY'S DATE: ${today}

=== ACTIVE CLIENTS (${activeClients.length}) ===
${JSON.stringify(clientSummaries, null, 1)}

=== TERMINATED CLIENTS: ${terminatedClients.length} ===

=== ACTIVE ALERTS (${activeAlerts.length}) ===
${JSON.stringify(activeAlerts.map(a => ({ client: a.client_name, type: a.type, severity: a.severity, msg: a.message })), null, 1)}

=== RECENT CHECK-INS ===
${JSON.stringify(recentCheckIns, null, 1)}

=== RECENT ACTIVITY LOGS ===
${JSON.stringify(activityLogs.slice(0, 50).map(a => ({ client_id: a.client_id, type: a.type, note: a.note, date: a.date })), null, 1)}

=== SLACK INSIGHTS ===
${JSON.stringify(slackSummaries, null, 1)}

=== LEAD LIST APPROVALS ===
${JSON.stringify(approvalSummaries, null, 1)}

=== RECOVERY PLANS ===
${JSON.stringify(recoveryPlans.map(r => ({ client_id: r.client_id, status: r.status, plan: r.plan?.substring(0, 200) })), null, 1)}

=== HEYREACH CACHE ===
${JSON.stringify(heyReachSummaries, null, 1)}

=== INFRA HEALTH SNAPSHOTS ===
${JSON.stringify(infraSummaries, null, 1)}

=== LEAD LISTS ===
${JSON.stringify(leadLists.map(l => ({ client_id: l.client_id, status: l.status, expected_next: l.expected_next_date })), null, 1)}

Be direct, specific, and actionable. Reference client names, specific numbers, and dates. Use markdown formatting for readability. When you find issues, rate their severity (🔴 Critical, 🟡 Warning, 🟢 Info).`;

    // Build messages array
    const messages = [
      { role: 'system', content: systemPrompt },
    ];

    // Add conversation history
    if (conversationHistory && conversationHistory.length > 0) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    messages.push({ role: 'user', content: message });

    // Call LLM
    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: messages.map(m => `[${m.role}]: ${m.content}`).join('\n\n'),
      model: 'claude_sonnet_4_6',
    });

    return Response.json({ response, timestamp: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
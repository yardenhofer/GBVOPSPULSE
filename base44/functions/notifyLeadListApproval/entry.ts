import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const { event, data } = await req.json();

    if (!data || event?.type !== 'create') {
      return Response.json({ ok: true, skipped: true });
    }

    // Get the main admin email from AppSettings
    const rawSettings = await base44.asServiceRole.entities.AppSettings.filter({ key: "lead_list_main_admin" });
    const settings = Array.isArray(rawSettings) ? rawSettings : (rawSettings?.items || rawSettings?.data || Object.values(rawSettings || {}));
    const mainAdminEmail = settings.length > 0 ? settings[0].value : null;

    if (!mainAdminEmail) {
      console.log("No main admin configured for lead list notifications");
      return Response.json({ ok: true, skipped: true, reason: "no_main_admin" });
    }

    // Send email notification to main admin
    await base44.asServiceRole.integrations.Core.SendEmail({
      to: mainAdminEmail,
      subject: `🔍 New Lead List Awaiting Approval: ${data.client_name}`,
      body: `
        <h2>New Lead List Submitted for Review</h2>
        <p><strong>Client:</strong> ${data.client_name}</p>
        <p><strong>List Name:</strong> ${data.list_name}</p>
        <p><strong>Submitted By:</strong> ${data.submitted_by_name || data.submitted_by}</p>
        <p><strong>Type:</strong> ${data.list_type === 'file' ? 'CSV Upload' : 'External Link'}</p>
        ${data.lead_count ? `<p><strong>Lead Count:</strong> ~${data.lead_count}</p>` : ''}
        ${data.notes ? `<p><strong>AM Notes:</strong> ${data.notes}</p>` : ''}
        <br/>
        <p>Please log in to the Ops Center to review and approve/deny this list.</p>
      `
    });

    // Also send Slack notification if webhook is configured
    const slackUrl = Deno.env.get("SLACK_WEBHOOK_URL_OPS_ALERTS");
    if (slackUrl) {
      await fetch(slackUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `📋 *New Lead List Pending Approval*\n*Client:* ${data.client_name}\n*List:* ${data.list_name}\n*Submitted by:* ${data.submitted_by_name || data.submitted_by}\n*Type:* ${data.list_type === 'file' ? 'CSV Upload' : 'External Link'}${data.lead_count ? `\n*Leads:* ~${data.lead_count}` : ''}`
        })
      });
    }

    return Response.json({ ok: true, notified: mainAdminEmail });
  } catch (error) {
    console.error("Lead list notification error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});
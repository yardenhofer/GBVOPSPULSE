import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { client_name, am_name, am_email, date, leads_generated, emails_sent, inmails_sent, on_behalf } = await req.json();

    const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL_OPS_ALERTS");
    if (!webhookUrl) {
      return Response.json({ error: "SLACK_WEBHOOK_URL_OPS_ALERTS not set" }, { status: 500 });
    }

    const submitter = user.full_name || user.email;
    const behalfNote = on_behalf ? ` (on behalf of ${am_name || am_email})` : '';

    const payload = {
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `📋 *Daily Entry Submitted*\n*${submitter}*${behalfNote} submitted their daily check-in for *${client_name}*`
          }
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: `📅 ${date}  •  📧 ${emails_sent || 0} emails  •  💬 ${inmails_sent || 0} inmails  •  🎯 ${leads_generated || 0} leads`
            }
          ]
        }
      ]
    };

    const resp = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    if (!resp.ok) {
      const text = await resp.text();
      return Response.json({ error: `Slack error: ${text}` }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
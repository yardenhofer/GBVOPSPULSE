import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const TEMPLATES = {
  weekly_update: (client, amName) => ({
    subject: `Weekly Update — ${client.name}`,
    body: `
      <p>Hi,</p>
      <p>Here's your weekly update from ${amName || 'your Account Manager'}:</p>
      <ul>
        <li><strong>Leads this week:</strong> ${client.leads_this_week ?? 0}${client.target_leads_per_week ? ` / ${client.target_leads_per_week} target` : ''}</li>
        <li><strong>Meetings booked:</strong> ${client.meetings_booked ?? 0}</li>
        ${client.close_rate ? `<li><strong>Close rate:</strong> ${client.close_rate}%</li>` : ''}
      </ul>
      <p>${client.client_feedback || ''}</p>
      <p>Let me know if you have any questions!</p>
      <p>Best,<br/>${amName || 'Your AM Team'}</p>
    `
  }),
  check_in: (client, amName) => ({
    subject: `Checking In — ${client.name}`,
    body: `
      <p>Hi,</p>
      <p>Just checking in to see how things are going on your end. We want to make sure everything is running smoothly.</p>
      <p>Please let us know if you have any feedback, questions, or concerns.</p>
      <p>Best,<br/>${amName || 'Your AM Team'}</p>
    `
  }),
  escalation_update: (client, amName) => ({
    subject: `Important Update — ${client.name}`,
    body: `
      <p>Hi,</p>
      <p>We wanted to reach out personally to address some concerns we've identified with your account.</p>
      <p>We take your success seriously and are actively working on a recovery plan to get things back on track.</p>
      <p>I'd like to schedule a call to discuss this further. Please let me know your availability.</p>
      <p>Best,<br/>${amName || 'Your AM Team'}</p>
    `
  }),
  lead_list_delay: (client, amName) => ({
    subject: `Lead List Update — ${client.name}`,
    body: `
      <p>Hi,</p>
      <p>We wanted to proactively reach out regarding your upcoming lead list. We're currently working on it and wanted to keep you informed of the timeline.</p>
      <p>We'll have an update for you shortly. Thank you for your patience.</p>
      <p>Best,<br/>${amName || 'Your AM Team'}</p>
    `
  }),
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { client_id, template, to_email, custom_subject, custom_body } = await req.json();

    const clients = await base44.entities.Client.filter({ id: client_id }, '-updated_date', 1);
    const client = clients[0];
    if (!client) return Response.json({ error: 'Client not found' }, { status: 404 });

    let subject, body;
    if (template && TEMPLATES[template]) {
      const t = TEMPLATES[template](client, user.full_name || user.email);
      subject = t.subject;
      body = t.body;
    } else {
      subject = custom_subject;
      body = custom_body;
    }

    await base44.integrations.Core.SendEmail({ to: to_email, subject, body });

    // Log activity
    await base44.entities.ActivityLog.create({
      client_id,
      am_email: user.email,
      date: new Date().toISOString().slice(0, 10),
      type: 'Email',
      note: `Template email sent: "${subject}"`,
      follow_up_needed: false,
    });

    return Response.json({ success: true });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
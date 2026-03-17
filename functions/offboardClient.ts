import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    console.log('t0', Date.now());
    const base44 = createClientFromRequest(req);
    console.log('t1 sdk init', Date.now());
    const user = await base44.auth.me();
    console.log('t2 auth', Date.now());
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { client_id } = await req.json();
    if (!client_id) return Response.json({ error: 'client_id required' }, { status: 400 });

    console.log('t3 starting parallel', Date.now());
    // Parallel: fetch client, slack token, and cached channel ID all at once
    const [client, connection, settings] = await Promise.all([
      base44.asServiceRole.entities.Client.get(client_id),
      base44.asServiceRole.connectors.getConnection('slackbot'),
      base44.asServiceRole.entities.AppSettings.filter({ key: 'offboarding_channel_id' })
    ]);
    console.log('t4 parallel done', Date.now());

    if (!client) return Response.json({ error: 'Client not found' }, { status: 404 });
    const { accessToken } = connection;

    let channelId = (settings.length > 0 && settings[0].value) ? settings[0].value : null;

    if (!channelId) {
      // Small page size to stay under CPU limits
      const res = await fetch(
        'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      if (data.ok) {
        const found = data.channels.find(ch => ch.name === 'client-offboarding');
        if (found) {
          channelId = found.id;
          await base44.asServiceRole.entities.AppSettings.create({ key: 'offboarding_channel_id', value: channelId });
        }
      }
    }

    if (!channelId) {
      return Response.json({ error: 'Could not find #client-offboarding channel. Please create it in Slack first.' }, { status: 400 });
    }

    // Post the offboarding checklist
    const postRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channel: channelId,
        username: 'GBV Ops Center',
        icon_emoji: ':clipboard:',
        blocks: [
          { type: 'header', text: { type: 'plain_text', text: `🚪 Client Off-Boarding: ${client.name}`, emoji: true } },
          { type: 'section', text: { type: 'mrkdwn', text: `*Initiated by:* ${user.full_name || user.email}\n*Date:* ${new Date().toLocaleDateString('en-US')}\n*Package:* ${client.package_type || '—'}\n*AM:* ${client.assigned_am || '—'}` } },
          { type: 'divider' },
          { type: 'section', text: { type: 'mrkdwn', text: '*Off-Boarding Checklist:*\n\n1️⃣ Turn off Instantly workspace\n2️⃣ Archive Slack Channel\n3️⃣ Ensure email domains have been cancelled\n4️⃣ Turn off auto billing (Notify Leon for Fanbasis)' } },
          { type: 'divider' },
          { type: 'context', elements: [{ type: 'mrkdwn', text: '⚠️ *Reply with CONFIRMED in a thread once all steps are complete.* Daily reminders will be sent until confirmed.' }] }
        ]
      })
    });
    const postData = await postRes.json();

    if (!postData.ok) {
      return Response.json({ error: `Slack error: ${postData.error}` }, { status: 500 });
    }

    const today = new Date().toISOString().split('T')[0];
    await base44.asServiceRole.entities.Client.update(client_id, {
      status: 'Off-Boarding',
      offboarding_slack_ts: postData.ts,
      offboarding_slack_channel: channelId,
      offboarding_confirmed: false,
      offboarding_date: today
    });

    return Response.json({ ok: true, ts: postData.ts, channel: channelId });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
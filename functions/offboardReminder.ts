import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Allow scheduled calls (no user) or admin users
    let user = null;
    try { user = await base44.auth.me(); } catch (_) {}
    if (user && user.role !== 'admin') {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get all clients in Off-Boarding that are not yet confirmed
    const offboarding = await base44.asServiceRole.entities.Client.filter({
      status: 'Off-Boarding',
      offboarding_confirmed: false
    });

    if (offboarding.length === 0) {
      return Response.json({ ok: true, message: 'No pending offboarding clients', checked: 0 });
    }

    const { accessToken } = await base44.asServiceRole.connectors.getConnection('slackbot');
    let confirmed = 0;
    let reminded = 0;

    for (const client of offboarding) {
      if (!client.offboarding_slack_ts || !client.offboarding_slack_channel) continue;

      // Check thread replies for "CONFIRMED"
      const repliesRes = await fetch(
        `https://slack.com/api/conversations.replies?channel=${client.offboarding_slack_channel}&ts=${client.offboarding_slack_ts}`,
        { headers: { 'Authorization': `Bearer ${accessToken}` } }
      );
      const repliesData = await repliesRes.json();

      let isConfirmed = false;
      if (repliesData.ok && repliesData.messages) {
        // Skip the first message (the original post), check thread replies
        for (const msg of repliesData.messages.slice(1)) {
          if (msg.text && msg.text.toUpperCase().includes('CONFIRMED')) {
            isConfirmed = true;
            break;
          }
        }
      }

      if (isConfirmed) {
        // Mark as confirmed and move to Terminated
        const today = new Date().toISOString().split('T')[0];
        await base44.asServiceRole.entities.Client.update(client.id, {
          offboarding_confirmed: true,
          status: 'Terminated',
          terminated_date: today
        });
        confirmed++;
      } else {
        // Only send a Slack reminder once per day (check if last reminder was today)
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];
        const lastReminder = client.last_offboard_reminder_date || '';
        
        if (lastReminder !== todayStr) {
          const daysSince = client.offboarding_date
            ? Math.floor((Date.now() - new Date(client.offboarding_date + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24))
            : '?';

          await fetch('https://slack.com/api/chat.postMessage', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              channel: client.offboarding_slack_channel,
              thread_ts: client.offboarding_slack_ts,
              username: 'GBV Ops Center',
              icon_emoji: ':bell:',
              text: `🔔 *Reminder:* Off-boarding for *${client.name}* has been pending for *${daysSince} day(s)*.\n\nPlease complete the checklist and reply *CONFIRMED* to this thread.`
            })
          });
          await base44.asServiceRole.entities.Client.update(client.id, {
            last_offboard_reminder_date: todayStr
          });
          reminded++;
        }
      }
    }

    return Response.json({ ok: true, checked: offboarding.length, confirmed, reminded });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
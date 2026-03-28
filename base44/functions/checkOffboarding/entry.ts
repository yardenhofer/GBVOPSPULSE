import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Get all Off-Boarding clients (filter confirmed ones in code since field may be null)
  const rawOffboarding = await base44.asServiceRole.entities.Client.filter({
    status: 'Off-Boarding'
  });
  const allOffboarding = Array.isArray(rawOffboarding) ? rawOffboarding : (rawOffboarding?.items || rawOffboarding?.data || Object.values(rawOffboarding || {}));
  
  const offboarding = allOffboarding.filter(c => !c.offboarding_confirmed);

  if (offboarding.length === 0) {
    return Response.json({ ok: true, message: 'No pending offboarding clients', checked: 0 });
  }

  const { accessToken } = await base44.asServiceRole.connectors.getConnection('slackbot');
  let confirmed = 0;
  let reminded = 0;

  for (const client of offboarding) {
    if (!client.offboarding_slack_ts || !client.offboarding_slack_channel) continue;

    const repliesRes = await fetch(
      `https://slack.com/api/conversations.replies?channel=${client.offboarding_slack_channel}&ts=${client.offboarding_slack_ts}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const repliesData = await repliesRes.json();

    let isConfirmed = false;
    if (repliesData.ok && repliesData.messages) {
      for (const msg of repliesData.messages.slice(1)) {
        if (msg.text && msg.text.toUpperCase().includes('CONFIRMED')) {
          isConfirmed = true;
          break;
        }
      }
    }

    if (isConfirmed) {
      const today = new Date().toISOString().split('T')[0];
      await base44.asServiceRole.entities.Client.update(client.id, {
        offboarding_confirmed: true,
        status: 'Terminated',
        terminated_date: today
      });
      confirmed++;
    } else {
      const todayStr = new Date().toISOString().split('T')[0];
      const lastReminder = client.last_offboard_reminder_date || '';

      if (lastReminder !== todayStr) {
        const daysSince = client.offboarding_date
          ? Math.floor((Date.now() - new Date(client.offboarding_date + 'T00:00:00').getTime()) / 86400000)
          : '?';

        await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel: client.offboarding_slack_channel,
            thread_ts: client.offboarding_slack_ts,
            username: 'GBV Ops Center',
            icon_emoji: ':bell:',
            text: `🔔 *Reminder:* Off-boarding for *${client.name}* has been pending for *${daysSince} day(s)*.\nPlease complete the checklist and reply *CONFIRMED* to this thread.`
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
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { client_id } = await req.json();
    if (!client_id) return Response.json({ error: 'client_id required' }, { status: 400 });

    // Parallel: fetch client, slack token, and cached channel ID all at once
    const [client, connection, settings] = await Promise.all([
      base44.asServiceRole.entities.Client.get(client_id),
      base44.asServiceRole.connectors.getConnection('slackbot'),
      base44.asServiceRole.entities.AppSettings.filter({ key: 'offboarding_channel_id' })
    ]);

    if (!client) return Response.json({ error: 'Client not found' }, { status: 404 });
    const { accessToken } = connection;

    const settingsArr = Array.isArray(settings) ? settings : (settings?.items || settings?.data || Object.values(settings || {}));
    let channelId = (settingsArr.length > 0 && settingsArr[0].value) ? settingsArr[0].value : null;

    // Helper: search Slack for the offboarding channel and cache the ID
    async function findAndCacheChannel() {
      const res = await fetch(
        'https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const data = await res.json();
      if (data.ok) {
        const found = data.channels.find(ch => ch.name === 'client-offboarding');
        if (found) {
          // Clear any stale cache entries, then create fresh
          const existingSettings = await base44.asServiceRole.entities.AppSettings.filter({ key: 'offboarding_channel_id' });
          if (Array.isArray(existingSettings)) {
            for (const s of existingSettings) {
              await base44.asServiceRole.entities.AppSettings.delete(s.id);
            }
          }
          await base44.asServiceRole.entities.AppSettings.create({ key: 'offboarding_channel_id', value: found.id });
          return found.id;
        }
      }
      return null;
    }

    let shouldPost = true;
    if (!channelId) {
      channelId = await findAndCacheChannel();
    }

    if (!channelId) {
      return Response.json({ error: 'Could not find #client-offboarding channel. Please create it in Slack and invite the GBV Ops bot to it first.' }, { status: 400 });
    }

    // Post the offboarding checklist — retry once with fresh channel search on channel_not_found
    const blocks = [
      { type: 'header', text: { type: 'plain_text', text: `🚪 Client Off-Boarding: ${client.name}`, emoji: true } },
      { type: 'section', text: { type: 'mrkdwn', text: `*Initiated by:* ${user.full_name || user.email}\n*Date:* ${new Date().toLocaleDateString('en-US')}\n*Package:* ${client.package_type || '—'}\n*AM:* ${client.assigned_am || '—'}` } },
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: '*Off-Boarding Checklist:*\n\n1️⃣ Turn off Instantly workspace\n2️⃣ Archive Slack Channel\n3️⃣ Ensure email domains have been cancelled\n4️⃣ Turn off auto billing (Notify Leon for Fanbasis)' } },
      { type: 'divider' },
      { type: 'context', elements: [{ type: 'mrkdwn', text: '⚠️ *Reply with CONFIRMED in a thread once all steps are complete.* Daily reminders will be sent until confirmed.' }] }
    ];

    let postRes = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: channelId, username: 'GBV Ops Center', icon_emoji: ':clipboard:', blocks })
    });
    let postData = await postRes.json();

    // If cached channel ID was stale (channel_not_found), clear cache, re-search, and retry
    if (!postData.ok && postData.error === 'channel_not_found') {
      console.log('Cached channel ID is stale, re-searching Slack for #client-offboarding...');
      channelId = await findAndCacheChannel();
      if (channelId) {
        postRes = await fetch('https://slack.com/api/chat.postMessage', {
          method: 'POST',
          headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ channel: channelId, username: 'GBV Ops Center', icon_emoji: ':clipboard:', blocks })
        });
        postData = await postRes.json();
      } else {
        return Response.json({ error: 'Could not find #client-offboarding channel. It may have been deleted or the bot was removed. Please recreate the channel and invite the bot.' }, { status: 400 });
      }
    }

    if (!postData.ok) {
      const hint = postData.error === 'not_in_channel'
        ? ' — The GBV Ops bot needs to be invited to this channel first'
        : '';
      return Response.json({ error: `Slack error: ${postData.error}${hint}` }, { status: 500 });
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
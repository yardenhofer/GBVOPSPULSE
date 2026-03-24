import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { accessToken } = await base44.asServiceRole.connectors.getConnection("slackbot");

  // Try listing channels
  let allChannels = [];
  let cursor = "";
  do {
    const url = `https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200&exclude_archived=true${cursor ? `&cursor=${cursor}` : ""}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await resp.json();
    if (!data.ok) {
      return Response.json({ error: data.error, hint: "channels:read scope may be missing" });
    }
    allChannels = allChannels.concat(data.channels || []);
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);

  const channelNames = allChannels.map(ch => ({ name: ch.name, id: ch.id, is_private: ch.is_private, is_member: ch.is_member, is_archived: ch.is_archived }));

  // If query param provided, filter
  const filterName = new URL(req.url).searchParams.get("filter") || null;
  const filtered = filterName 
    ? channelNames.filter(ch => ch.name.toLowerCase().includes(filterName.toLowerCase()))
    : channelNames;

  return Response.json({ 
    total_channels: allChannels.length, 
    showing: filtered.length,
    channels: filtered 
  });
});
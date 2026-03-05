import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (user?.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const { accessToken } = await base44.asServiceRole.connectors.getConnection("slackbot");

  // 1. Get all Slack channels
  let allChannels = [];
  let cursor = "";
  do {
    const url = `https://slack.com/api/conversations.list?types=public_channel,private_channel&limit=200${cursor ? `&cursor=${cursor}` : ""}`;
    const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    const data = await resp.json();
    if (!data.ok) {
      console.error("Slack channels.list error:", data.error);
      break;
    }
    allChannels = allChannels.concat(data.channels || []);
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);

  console.log(`Found ${allChannels.length} Slack channels: ${allChannels.map(ch => ch.name).join(', ')}`);

  // 2. Get all clients
  const clients = await base44.asServiceRole.entities.Client.list("-updated_date", 200);

  // 3. Auto-match channels to clients
  const results = [];

  for (const client of clients) {
    // Find matching channel: try stored channel_id first, then auto-match by name
    let channel = null;
    
    if (client.slack_channel_id) {
      channel = allChannels.find(ch => ch.id === client.slack_channel_id);
    }
    
    if (!channel) {
      // Auto-match: normalize client name and channel name for comparison
      // Slack channels use hyphens for spaces, so normalize both to compare
      const normalizedName = client.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      channel = allChannels.find(ch => {
        const chName = ch.name.toLowerCase().replace(/[^a-z0-9-]/g, '');
        const chNameStripped = chName.replace(/-/g, '');
        return chNameStripped.includes(normalizedName) || normalizedName.includes(chNameStripped);
      });
      if (!channel) {
        console.log(`No match for "${client.name}" (normalized: "${normalizedName}") against channels`);
      }
      
      // Save matched channel_id for future use
      if (channel && !client.slack_channel_id) {
        await base44.asServiceRole.entities.Client.update(client.id, { slack_channel_id: channel.id });
      }
    }

    if (!channel) {
      console.log(`No Slack channel found for client: ${client.name}`);
      continue;
    }

    console.log(`Matched "${client.name}" → #${channel.name}`);

    // 4. Fetch recent messages (last 24 hours)
    const since = Math.floor((Date.now() - 24 * 60 * 60 * 1000) / 1000);
    const histResp = await fetch(
      `https://slack.com/api/conversations.history?channel=${channel.id}&oldest=${since}&limit=100`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const histData = await histResp.json();
    
    if (!histData.ok) {
      console.error(`Error fetching history for #${channel.name}:`, histData.error);
      continue;
    }

    const messages = (histData.messages || []).filter(m => !m.bot_id && m.type === 'message' && m.text);
    
    if (messages.length === 0) {
      console.log(`No recent messages in #${channel.name}`);
      continue;
    }

    // 5. Resolve user names so the LLM can distinguish client vs agency staff
    const uniqueUsers = [...new Set(messages.map(m => m.user).filter(Boolean))];
    const userMap = {};
    for (const uid of uniqueUsers) {
      const uResp = await fetch(`https://slack.com/api/users.info?user=${uid}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const uData = await uResp.json();
      if (uData.ok && uData.user) {
        userMap[uid] = uData.user.real_name || uData.user.profile?.display_name || uData.user.name || uid;
      } else {
        userMap[uid] = uid;
      }
    }

    // Build message text with sender names
    const messageText = messages.slice(0, 50).map(m => {
      const sender = userMap[m.user] || 'Unknown';
      return `[${sender}]: ${m.text}`;
    }).join('\n---\n');

    // 6. Analyze with LLM
    const analysis = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are an AI analyst for a B2B lead generation agency called GBV. Analyze the following Slack messages from a client channel for "${client.name}".

IMPORTANT: Messages are labeled with sender names. GBV agency staff/account managers are the people SENDING updates about campaigns, leads, LinkedIn outreach, etc. The CLIENT is the person RECEIVING these services and responding to them. Focus your sentiment analysis on the CLIENT's messages and reactions, NOT the agency team's updates. If only agency staff messages are present with no client responses, note that and assess based on available context (e.g. lack of client response could indicate disengagement).

Determine:
1. SENTIMENT: How does the CLIENT feel about GBV's services? Consider their tone, complaints, praise, responsiveness, and engagement.
2. UPSELL OPPORTUNITIES: Is the client mentioning new markets, wanting more leads, interested in LinkedIn outreach, expanding to new regions, or showing signs they'd benefit from additional services?
3. RISK SIGNALS: Any client complaints, frustration, mentions of competitors, threats to cancel, long silences from the client, or dissatisfaction?
4. SUMMARY: Brief 2-3 sentence summary of the client's communication tone and key topics. Clearly distinguish between what the agency said vs how the client responded.
5. KEY TOPICS: Main subjects being discussed.

Messages:
${messageText}`,
      response_json_schema: {
        type: "object",
        properties: {
          sentiment: { type: "string", enum: ["Happy", "Neutral", "Slightly Concerned", "Unhappy"] },
          sentiment_score: { type: "number", description: "1-10 scale, 10 being very happy" },
          summary: { type: "string" },
          upsell_opportunities: { type: "string", description: "Describe any upsell opportunities, or 'None detected' if none" },
          risk_signals: { type: "string", description: "Describe any risk signals, or 'None detected' if none" },
          key_topics: { type: "string", description: "Comma-separated list of key topics" }
        }
      }
    });

    console.log(`Analysis for ${client.name}:`, JSON.stringify(analysis));

    // 7. Save insight
    await base44.asServiceRole.entities.SlackInsight.create({
      client_id: client.id,
      client_name: client.name,
      sentiment: analysis.sentiment,
      sentiment_score: analysis.sentiment_score,
      summary: analysis.summary,
      upsell_opportunities: analysis.upsell_opportunities,
      risk_signals: analysis.risk_signals,
      key_topics: analysis.key_topics,
      messages_analyzed: messages.length,
      analysis_date: new Date().toISOString()
    });

    // 8. Update client sentiment if AI detected a change
    if (analysis.sentiment && analysis.sentiment !== client.client_sentiment) {
      const updateData = { client_sentiment: analysis.sentiment };
      // Track when sentiment goes negative
      if ((analysis.sentiment === "Slightly Concerned" || analysis.sentiment === "Unhappy") && 
          client.client_sentiment !== "Slightly Concerned" && client.client_sentiment !== "Unhappy") {
        updateData.unhappy_since = new Date().toISOString().split('T')[0];
      }
      // Clear unhappy_since if sentiment improved
      if ((analysis.sentiment === "Happy" || analysis.sentiment === "Neutral") && 
          (client.client_sentiment === "Slightly Concerned" || client.client_sentiment === "Unhappy")) {
        updateData.unhappy_since = null;
      }
      await base44.asServiceRole.entities.Client.update(client.id, updateData);
      console.log(`Updated ${client.name} sentiment: ${client.client_sentiment} → ${analysis.sentiment}`);
    }

    results.push({
      client: client.name,
      channel: channel.name,
      sentiment: analysis.sentiment,
      score: analysis.sentiment_score,
      messages: messages.length
    });
  }

  return Response.json({ 
    success: true, 
    analyzed: results.length,
    results 
  });
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Allow both admin users and service-role calls (from batch scheduler)
  let isAuthorized = false;
  try {
    const user = await base44.auth.me();
    if (user?.role === 'admin') isAuthorized = true;
  } catch (e) { /* service role call — no user token */ }
  
  if (!isAuthorized) {
    // Check if this is a service-role invocation (has client_id in body from batch)
    // Service role calls come from other backend functions via base44.asServiceRole.functions.invoke
    // They won't have a user, but they're internal so we allow them
    try {
      const testBody = await req.clone().json();
      if (testBody?.client_id) isAuthorized = true;
    } catch(e) {}
  }
  
  if (!isAuthorized) {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  // Support single-client mode to avoid timeouts
  let body = {};
  try { body = await req.json(); } catch(e) { /* no body */ }
  const singleClientId = body.client_id || null;

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

  console.log(`Found ${allChannels.length} Slack channels`);

  // 2. Get clients — single or all
  let clients;
  if (singleClientId) {
    clients = await base44.asServiceRole.entities.Client.filter({ id: singleClientId }, "-updated_date", 1);
  } else {
    clients = await base44.asServiceRole.entities.Client.list("-updated_date", 200);
  }

  // 3. Auto-match channels to clients
  const results = [];

  for (const client of clients) {
    // Find matching channel: try stored channel_id first, then auto-match by name
    let channel = null;
    
    if (client.slack_channel_id) {
      channel = allChannels.find(ch => ch.id === client.slack_channel_id);
    }
    
    // Try manual slack_channel_name override before auto-match
    if (!channel && client.slack_channel_name) {
      const manualName = client.slack_channel_name.toLowerCase().replace(/^#/, '').trim();
      channel = allChannels.find(ch => ch.name.toLowerCase() === manualName);
      if (channel) {
        console.log(`Matched "${client.name}" via manual channel name → #${channel.name}`);
        // Save channel ID for future lookups
        if (!client.slack_channel_id || client.slack_channel_id !== channel.id) {
          await base44.asServiceRole.entities.Client.update(client.id, { slack_channel_id: channel.id });
        }
      }
    }

    if (!channel) {
      // Auto-match: normalize client name and channel name for comparison
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

    // 4. Fetch recent messages (last 30 days) — paginate to get all messages
    const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
    let allMessages = [];
    let histCursor = "";
    do {
      const histUrl = `https://slack.com/api/conversations.history?channel=${channel.id}&oldest=${since}&limit=200${histCursor ? `&cursor=${histCursor}` : ""}`;
      const histResp = await fetch(histUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
      const histData = await histResp.json();
      
      if (!histData.ok) {
        console.error(`Error fetching history for #${channel.name}:`, histData.error);
        break;
      }
      allMessages = allMessages.concat(histData.messages || []);
      histCursor = histData.response_metadata?.next_cursor || "";
    } while (histCursor);

    // 4b. Fetch thread replies for any threaded messages
    const threadParents = allMessages.filter(m => m.reply_count && m.reply_count > 0 && m.ts);
    for (const parent of threadParents) {
      const repliesResp = await fetch(
        `https://slack.com/api/conversations.replies?channel=${channel.id}&ts=${parent.ts}&oldest=${since}&limit=200`,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      const repliesData = await repliesResp.json();
      if (repliesData.ok && repliesData.messages) {
        // replies includes the parent, skip it to avoid duplicates
        const replies = repliesData.messages.filter(r => r.ts !== parent.ts);
        allMessages = allMessages.concat(replies);
      }
    }

    // Deduplicate by ts, filter out bots and system messages
    const seenTs = new Set();
    const messages = allMessages
      .filter(m => {
        if (seenTs.has(m.ts)) return false;
        seenTs.add(m.ts);
        return !m.bot_id && m.type === 'message' && !m.subtype && m.text;
      })
      .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts)); // chronological order
    
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

    // Build message text with sender names — use up to 100 messages for better context
    const messageText = messages.slice(-100).map(m => {
      const sender = userMap[m.user] || 'Unknown';
      const date = new Date(parseFloat(m.ts) * 1000).toISOString().split('T')[0];
      return `[${date}] [${sender}]: ${m.text}`;
    }).join('\n---\n');

    console.log(`#${channel.name}: ${messages.length} total messages (${threadParents.length} threads expanded). Sending ${Math.min(messages.length, 100)} to LLM.`);

    // 6. Analyze with LLM
    const analysis = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are an AI analyst for a B2B lead generation agency called GBV. Analyze the following Slack messages from a client channel for "${client.name}".

CLIENT CONTEXT:
- Client start date: ${client.start_date || 'Unknown'}
- Package: ${client.package_type || 'Unknown'}
- Current status: ${client.status || 'Unknown'}
- Today's date: ${new Date().toISOString().split('T')[0]}
DO NOT make assumptions about when the client joined — use the start date above. These messages are from the last 30 days, not the full history. If there are no client messages, simply state "No client messages in the past 30 days" without speculating about disengagement or channel joins.

IMPORTANT: Messages are labeled with sender names and dates. GBV agency staff/account managers are the people SENDING updates about campaigns, leads, LinkedIn outreach, etc. The CLIENT is the person RECEIVING these services and responding to them. Focus your sentiment analysis on the CLIENT's messages and reactions, NOT the agency team's updates. If only agency staff messages are present with no client responses, note that and assess based on available context (e.g. lack of client response could indicate disengagement).

CRITICAL — RECENCY-WEIGHTED SENTIMENT:
Your sentiment rating MUST reflect the client's CURRENT state, not an average of the whole month. Use the client's MOST RECENT messages as the primary anchor for sentiment — wherever they fall in the 30-day window. Then apply this layered approach:

1. Find the client's LAST FEW MESSAGES (the most recent cluster of client activity). These are the primary basis for sentiment — even if they were 3 weeks ago.
2. If there are messages across multiple time periods, later messages override earlier ones. A client who was upset 3 weeks ago but positive last week = currently positive.
3. If there has been NO client activity for 14+ days, note the silence as a potential engagement concern in risk_signals, but base the sentiment on whatever the last client messages conveyed. Do NOT automatically downgrade sentiment just because of silence — some clients are simply low-touch communicators.
4. If negative issues from earlier were clearly addressed/resolved (e.g. agency responded, client acknowledged fix), sentiment should reflect the resolution, not the original complaint.

SENTIMENT TREND:
Determine the TREND by comparing sentiment across the full 30-day window:
- "Improving" = client tone has gotten more positive over the period (earlier negative → later positive, or issues got resolved)
- "Stable" = sentiment has been relatively consistent throughout (whether consistently happy OR consistently concerned)
- "Declining" = client tone has gotten worse over the period (earlier positive → later negative, or new unresolved issues emerged)

CRITICAL RISK KEYWORDS TO WATCH FOR: cancellation, cancel, ending, not renewing, looking at other options, not working, disappointed, frustrated, not seeing results, waste of money, pulling the plug, pausing, downgrade, cutting budget, competitor, alternative, not worth it, rethinking, reconsidering. If ANY of these themes appear in the client's MOST RECENT messages (their last cluster of activity), sentiment MUST be "Unhappy" or at minimum "Slightly Concerned", and risk_signals MUST describe the specific concern. If these keywords only appeared in OLDER messages and were since resolved or followed by positive engagement, note them in risk_signals but don't let them override the current sentiment.

Determine:
1. SENTIMENT: The CLIENT's CURRENT feeling about GBV's services based on their MOST RECENT messages (wherever they fall in the 30-day window). Consider their tone, complaints, praise, responsiveness, and engagement.
2. SENTIMENT TREND: "Improving", "Stable", or "Declining" over the full 30-day window.
3. UPSELL OPPORTUNITIES: Is the client mentioning new markets, wanting more leads, interested in LinkedIn outreach, expanding to new regions, or showing signs they'd benefit from additional services?
4. RISK SIGNALS: Any client complaints, frustration, mentions of competitors, threats to cancel, discussions about cancellation options, long silences from the client, or dissatisfaction? Note whether these are recent or resolved.
5. SUMMARY: Brief 2-3 sentence summary focusing on the client's CURRENT state and how it compares to earlier in the month. Clearly distinguish between what the agency said vs how the client responded.
6. KEY TOPICS: Main subjects being discussed.
7. LAST GBV TOUCHPOINT: Find the date of the MOST RECENT message sent by a GBV/Grow Big Ventures team member (agency staff, NOT the client). Return the date as YYYY-MM-DD. If no GBV staff messages exist, return null.
8. LAST CLIENT REPLY: Find the date of the MOST RECENT message sent by the CLIENT (NOT GBV staff). Return the date as YYYY-MM-DD. If no client messages exist, return null.

Messages:
${messageText}`,
      response_json_schema: {
        type: "object",
        properties: {
          sentiment: { type: "string", enum: ["Happy", "Neutral", "Slightly Concerned", "Unhappy"] },
          sentiment_score: { type: "number", description: "1-10 scale, 10 being very happy, based on CURRENT (last 7 days) sentiment" },
          sentiment_trend: { type: "string", enum: ["Improving", "Stable", "Declining"], description: "Direction of sentiment over the full 30-day window" },
          summary: { type: "string" },
          upsell_opportunities: { type: "string", description: "Describe any upsell opportunities, or 'None detected' if none" },
          risk_signals: { type: "string", description: "Describe any risk signals (note if recent or resolved), or 'None detected' if none" },
          key_topics: { type: "string", description: "Comma-separated list of key topics" },
          last_gbv_touchpoint: { type: "string", description: "YYYY-MM-DD date of most recent GBV staff message, or null" },
          last_client_reply: { type: "string", description: "YYYY-MM-DD date of most recent client message, or null" }
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
      sentiment_trend: analysis.sentiment_trend || "Stable",
      summary: analysis.summary,
      upsell_opportunities: analysis.upsell_opportunities,
      risk_signals: analysis.risk_signals,
      key_topics: analysis.key_topics,
      messages_analyzed: messages.length,
      analysis_date: new Date().toISOString()
    });

    // 8. Update client fields based on analysis
    const updateData = {};

    // Update sentiment if changed
    if (analysis.sentiment && analysis.sentiment !== client.client_sentiment) {
      updateData.client_sentiment = analysis.sentiment;
      if ((analysis.sentiment === "Slightly Concerned" || analysis.sentiment === "Unhappy") && 
          client.client_sentiment !== "Slightly Concerned" && client.client_sentiment !== "Unhappy") {
        updateData.unhappy_since = new Date().toISOString().split('T')[0];
      }
      if ((analysis.sentiment === "Happy" || analysis.sentiment === "Neutral") && 
          (client.client_sentiment === "Slightly Concerned" || client.client_sentiment === "Unhappy")) {
        updateData.unhappy_since = null;
      }
    }

    // Update last AM touchpoint from Slack
    if (analysis.last_gbv_touchpoint) {
      updateData.last_am_touchpoint = analysis.last_gbv_touchpoint;
    }

    // Update last client reply date from Slack
    if (analysis.last_client_reply) {
      updateData.last_client_reply_date = analysis.last_client_reply;
    }

    if (Object.keys(updateData).length > 0) {
      await base44.asServiceRole.entities.Client.update(client.id, updateData);
      console.log(`Updated ${client.name}:`, JSON.stringify(updateData));
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
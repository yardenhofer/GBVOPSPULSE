import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  // Parse optional batch_size from body (default: 3 clients per run)
  let body = {};
  try { body = await req.json(); } catch(e) { /* no body */ }
  const BATCH_SIZE = body.batch_size || 3;

  const clients = await base44.asServiceRole.entities.Client.list("-updated_date", 200);
  const activeClients = clients.filter(c => c.status !== "Terminated");
  const withChannel = activeClients.filter(c => c.slack_channel_id || c.slack_channel_name);

  // Fetch latest insights to prioritize clients with oldest/no insights
  const allInsights = await base44.asServiceRole.entities.SlackInsight.list("-analysis_date", 500);
  const latestInsightByClient = {};
  for (const ins of allInsights) {
    if (!latestInsightByClient[ins.client_id]) {
      latestInsightByClient[ins.client_id] = ins.analysis_date;
    }
  }

  // Get all Slack channels upfront so we can pre-filter
  const { accessToken } = await base44.asServiceRole.connectors.getConnection("slackbot");

  async function slackFetch(url) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
      const data = await resp.json();
      if (data.ok) return data;
      if (data.error === 'ratelimited') {
        const retryAfter = Math.min(parseInt(resp.headers.get('Retry-After') || '5', 10), 15);
        console.log(`Rate limited (attempt ${attempt + 1}), waiting ${retryAfter}s...`);
        await new Promise(r => setTimeout(r, retryAfter * 1000));
        continue;
      }
      return data;
    }
    return { ok: false, error: 'ratelimited_after_retries' };
  }

  let allChannels = [];
  let cursor = "";
  do {
    const url = `https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=200${cursor ? `&cursor=${cursor}` : ""}`;
    const data = await slackFetch(url);
    if (!data.ok) { console.error("channels.list error:", data.error); break; }
    allChannels = allChannels.concat(data.channels || []);
    cursor = data.response_metadata?.next_cursor || "";
  } while (cursor);
  console.log(`Found ${allChannels.length} Slack channels`);

  // Pre-match channels to clients so we can skip unmatched ones before batching
  function findChannel(client) {
    if (client.slack_channel_id) {
      const ch = allChannels.find(c => c.id === client.slack_channel_id);
      if (ch) return ch;
    }
    if (client.slack_channel_name) {
      const manualName = client.slack_channel_name.toLowerCase().replace(/^#/, '').trim();
      const ch = allChannels.find(c => c.name.toLowerCase() === manualName);
      if (ch) return ch;
    }
    const normalizedName = client.name.toLowerCase().replace(/[^a-z0-9]/g, '');
    return allChannels.find(ch => {
      const chNameStripped = ch.name.toLowerCase().replace(/[^a-z0-9]/g, '');
      return chNameStripped.includes(normalizedName) || normalizedName.includes(chNameStripped);
    });
  }

  const matchable = withChannel.map(c => ({ client: c, channel: findChannel(c) })).filter(x => x.channel);
  const unmatched = withChannel.length - matchable.length;

  // Sort: clients with no insight first, then oldest insight first
  matchable.sort((a, b) => {
    const aDate = latestInsightByClient[a.client.id] || "1970-01-01";
    const bDate = latestInsightByClient[b.client.id] || "1970-01-01";
    return aDate.localeCompare(bDate);
  });

  // Take only BATCH_SIZE clients per run
  const eligible = matchable.slice(0, BATCH_SIZE);
  console.log(`Batch: ${eligible.length} of ${matchable.length} matchable clients (batch_size=${BATCH_SIZE}, ${unmatched} unmatched, ${activeClients.length - withChannel.length} no channel config)`);

  if (eligible.length === 0) {
    return Response.json({ success: true, message: "No clients to analyze", processed: 0 });
  }

  // Pause after channel list to let Slack rate limits reset
  await new Promise(r => setTimeout(r, 5000));

  // Fetch GBV staff emails once
  let gbvEmails = new Set();
  try {
    const appUsers = await base44.asServiceRole.entities.User.list("-created_date", 200);
    for (const u of appUsers) {
      if (u.email) gbvEmails.add(u.email.toLowerCase());
    }
  } catch (e) {
    console.error("Could not fetch app users:", e.message);
  }

  // Global user cache to avoid repeated Slack API calls
  const globalUserMap = {};
  const globalUserIsGbv = {};

  const results = [];
  const errors = [];
  const startTime = Date.now();
  const MAX_RUNTIME_MS = 120000;

  for (const { client, channel } of eligible) {
    if (Date.now() - startTime > MAX_RUNTIME_MS) {
      console.log(`Time limit reached after ${results.length} clients.`);
      break;
    }

    try {
      console.log(`[RUN] Analyzing: ${client.name} → #${channel.name}`);

      // Save channel ID if not already stored
      if (!client.slack_channel_id || client.slack_channel_id !== channel.id) {
        await base44.asServiceRole.entities.Client.update(client.id, { slack_channel_id: channel.id });
      }

      // Fetch recent messages (last 30 days)
      const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
      let allMessages = [];
      let histCursor = "";
      do {
        const histUrl = `https://slack.com/api/conversations.history?channel=${channel.id}&oldest=${since}&limit=200${histCursor ? `&cursor=${histCursor}` : ""}`;
        const histData = await slackFetch(histUrl);
        if (!histData.ok) {
          console.error(`Error fetching history for #${channel.name}:`, histData.error);
          break;
        }
        allMessages = allMessages.concat(histData.messages || []);
        histCursor = histData.response_metadata?.next_cursor || "";
      } while (histCursor);

      // Skip thread expansion in batch mode to avoid rate limits
      // Top-level messages are sufficient for sentiment analysis

      // Deduplicate and filter
      const seenTs = new Set();
      const messages = allMessages
        .filter(m => {
          if (seenTs.has(m.ts)) return false;
          seenTs.add(m.ts);
          return !m.bot_id && m.type === 'message' && !m.subtype && m.text;
        })
        .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

      if (messages.length === 0) {
        console.log(`No recent messages in #${channel.name}`);
        continue;
      }

      // Resolve user names (with global cache to avoid repeated API calls)
      const uniqueUsers = [...new Set(messages.map(m => m.user).filter(Boolean))];
      for (const uid of uniqueUsers) {
        if (globalUserMap[uid] !== undefined) continue; // already cached
        const uData = await slackFetch(`https://slack.com/api/users.info?user=${uid}`);
        if (uData.ok && uData.user) {
          globalUserMap[uid] = uData.user.real_name || uData.user.profile?.display_name || uData.user.name || uid;
          const slackEmail = (uData.user.profile?.email || "").toLowerCase();
          globalUserIsGbv[uid] = slackEmail ? gbvEmails.has(slackEmail) : false;
        } else {
          globalUserMap[uid] = uid;
          globalUserIsGbv[uid] = false;
        }
      }

      // Compute touchpoint dates
      let lastGbvDate = null;
      let lastClientDate = null;
      for (const m of messages) {
        const msgDate = new Date(parseFloat(m.ts) * 1000).toISOString().split('T')[0];
        if (globalUserIsGbv[m.user]) {
          if (!lastGbvDate || msgDate > lastGbvDate) lastGbvDate = msgDate;
        } else {
          if (!lastClientDate || msgDate > lastClientDate) lastClientDate = msgDate;
        }
      }

      const gbvNames = Object.entries(globalUserIsGbv)
        .filter(([uid, isGbv]) => isGbv && uniqueUsers.includes(uid))
        .map(([uid]) => globalUserMap[uid])
        .filter(Boolean);

      const messageText = messages.slice(-100).map(m => {
        const sender = globalUserMap[m.user] || 'Unknown';
        const date = new Date(parseFloat(m.ts) * 1000).toISOString().split('T')[0];
        const tag = globalUserIsGbv[m.user] ? ' [GBV STAFF]' : ' [CLIENT]';
        return `[${date}] [${sender}${tag}]: ${m.text}`;
      }).join('\n---\n');

      console.log(`#${channel.name}: ${messages.length} messages, sending ${Math.min(messages.length, 100)} to LLM`);

      // Analyze with LLM
      const analysis = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt: `You are an AI analyst for a B2B lead generation agency called GBV. Analyze the following Slack messages from a client channel for "${client.name}".

CLIENT CONTEXT:
- Client start date: ${client.start_date || 'Unknown'}
- Package: ${client.package_type || 'Unknown'}
- Current status: ${client.status || 'Unknown'}
- Today's date: ${new Date().toISOString().split('T')[0]}

IMPORTANT: Messages are labeled [GBV STAFF] or [CLIENT]. ${gbvNames.length > 0 ? `Known GBV team members: ${gbvNames.join(', ')}.` : ''} Focus sentiment analysis on CLIENT messages, not agency updates.

CRITICAL — RECENCY-WEIGHTED SENTIMENT:
Base sentiment on the client's MOST RECENT messages. Later messages override earlier ones. If no client activity for 14+ days, note silence in risk_signals but base sentiment on last client messages.

RISK KEYWORDS TO WATCH: cancellation, cancel, not renewing, not working, disappointed, frustrated, waste of money, pausing, competitor, alternative, reconsidering. If these appear in recent client messages, sentiment MUST be "Unhappy" or "Slightly Concerned".

Determine:
1. SENTIMENT: Client's current feeling (Happy/Neutral/Slightly Concerned/Unhappy)
2. SENTIMENT TREND: Improving/Stable/Declining over 30 days
3. UPSELL OPPORTUNITIES: New markets, more leads, LinkedIn interest, expansion signs
4. RISK SIGNALS: Complaints, frustration, competitor mentions, cancellation threats, long silences
5. SUMMARY: 2-3 sentences on client's current state
6. KEY TOPICS: Main subjects discussed

Messages:
${messageText}`,
        response_json_schema: {
          type: "object",
          properties: {
            sentiment: { type: "string", enum: ["Happy", "Neutral", "Slightly Concerned", "Unhappy"] },
            sentiment_score: { type: "number" },
            sentiment_trend: { type: "string", enum: ["Improving", "Stable", "Declining"] },
            summary: { type: "string" },
            upsell_opportunities: { type: "string" },
            risk_signals: { type: "string" },
            key_topics: { type: "string" }
          }
        }
      });

      // Save insight
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

      // Update client
      const updateData = {};
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
      if (lastGbvDate) updateData.last_am_touchpoint = lastGbvDate;
      if (lastClientDate) updateData.last_client_reply_date = lastClientDate;

      if (Object.keys(updateData).length > 0) {
        await base44.asServiceRole.entities.Client.update(client.id, updateData);
      }

      console.log(`✓ ${client.name}: ${analysis.sentiment}`);
      results.push({ client: client.name, sentiment: analysis.sentiment, score: analysis.sentiment_score, messages: messages.length });

    } catch (err) {
      const errMsg = err?.message || String(err);
      console.error(`✗ ${client.name}: ${errMsg}`);
      errors.push({ client: client.name, error: errMsg });
    }

    // Delay between clients to reduce Slack rate limiting
    await new Promise(r => setTimeout(r, 2000));
  }

  const skipped = eligible.length - results.length - errors.length;
  console.log(`Done: ${results.length} succeeded, ${errors.length} failed, ${skipped} skipped (time/no-channel)`);
  return Response.json({ success: true, processed: results.length, failed: errors.length, skipped, results, errors });
});
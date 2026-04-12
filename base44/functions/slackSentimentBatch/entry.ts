import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const clonedReq = req.clone();
    const base44 = createClientFromRequest(req);
    let body = {};
    try { body = await clonedReq.json(); } catch(_) { /* no body */ }

    // Helper to safely unwrap SDK list responses
    function unwrapList(raw) {
      if (Array.isArray(raw)) return raw;
      // SDK sometimes returns a JSON string — parse it
      if (typeof raw === 'string') {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) return parsed;
          if (parsed && typeof parsed === 'object') {
            return parsed.items || parsed.data || parsed.results || [];
          }
        } catch (e) {
          console.error("unwrapList: failed to parse string response", e.message);
        }
        return [];
      }
      if (raw && typeof raw === 'object') {
        if (Array.isArray(raw.items)) return raw.items;
        if (Array.isArray(raw.data)) return raw.data;
        if (Array.isArray(raw.results)) return raw.results;
      }
      console.error("unwrapList: unexpected shape", typeof raw);
      return [];
    }

    // 1. Load clients + insights sequentially to avoid brotli decompression issues
    const rawClients = await base44.asServiceRole.entities.Client.list("-updated_date", 200);
    const clients = unwrapList(rawClients);
    console.log(`Loaded ${clients.length} clients (raw type: ${Array.isArray(rawClients) ? 'array' : typeof rawClients})`);
    
    const rawInsights = await base44.asServiceRole.entities.SlackInsight.list("-analysis_date", 200);
    const allInsights = unwrapList(rawInsights);
    console.log(`Loaded ${allInsights.length} insights (raw type: ${Array.isArray(rawInsights) ? 'array' : typeof rawInsights})`);

    const activeClients = clients.filter(c => c.status !== "Terminated" && c.status !== "Off-Boarding");

    // Build map of latest insight per client
    const latestInsightByClient = {};
    for (const ins of allInsights) {
      if (!latestInsightByClient[ins.client_id]) {
        latestInsightByClient[ins.client_id] = ins.analysis_date;
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];

    const needsRefresh = [];
    const alreadyDoneToday = [];
    for (const c of activeClients) {
      const lastDate = latestInsightByClient[c.id];
      if (lastDate && lastDate.startsWith(todayStr)) {
        alreadyDoneToday.push(c);
      } else {
        needsRefresh.push(c);
      }
    }

    console.log(`Clients: ${activeClients.length} active, ${needsRefresh.length} need refresh today, ${alreadyDoneToday.length} already done today`);

    if (needsRefresh.length === 0) {
      return Response.json({
        success: true,
        message: "All clients already analyzed today",
        processed: 0,
        total_active: activeClients.length,
        done_today: alreadyDoneToday.length
      });
    }

    // 2. Get Slack connection
    const { accessToken } = await base44.asServiceRole.connectors.getConnection("slackbot");
    console.log(`Slack token obtained: ${accessToken ? accessToken.substring(0, 10) + '...' : 'MISSING'}`);

    async function slackFetch(url) {
      for (let attempt = 0; attempt < 3; attempt++) {
        const resp = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
        const data = await resp.json();
        if (data.ok) return data;
        // Non-retryable errors — bail immediately
        if (data.error === 'token_expired' || data.error === 'invalid_auth' || data.error === 'token_revoked' || data.error === 'not_authed') {
          console.error(`Slack auth error: ${data.error} — token needs re-authorization`);
          return data;
        }
        if (data.error === 'ratelimited') {
          const retryAfter = parseInt(resp.headers.get('Retry-After') || '0', 10);
          // If Slack wants us to wait more than 15s, skip this call to avoid timeout
          if (retryAfter > 15) {
            console.log(`Rate limited, Retry-After=${retryAfter}s too long, skipping`);
            return { ok: false, error: 'ratelimited_skip' };
          }
          const wait = retryAfter > 0 ? retryAfter + 1 : (attempt + 1) * 5;
          console.log(`Rate limited (attempt ${attempt + 1}/3), waiting ${wait}s...`);
          await new Promise(r => setTimeout(r, wait * 1000));
          continue;
        }
        return data;
      }
      return { ok: false, error: 'ratelimited_after_retries' };
    }

    const clientsWithCachedId = needsRefresh.filter(c => c.slack_channel_id);
    const clientsNeedingMatch = needsRefresh.filter(c => !c.slack_channel_id && (c.slack_channel_name || c.name));

    const matchable = [];
    for (const c of clientsWithCachedId) {
      matchable.push({ client: c, channel: { id: c.slack_channel_id, name: c.slack_channel_name || c.name } });
    }

    matchable.sort((a, b) => {
      const aDate = latestInsightByClient[a.client.id] || "1970-01-01";
      const bDate = latestInsightByClient[b.client.id] || "1970-01-01";
      return aDate.localeCompare(bDate);
    });

    if (clientsNeedingMatch.length > 0) {
      let allChannels = [];
      let cursor = "";
      do {
        const url = `https://slack.com/api/conversations.list?types=public_channel,private_channel&exclude_archived=true&limit=200${cursor ? `&cursor=${cursor}` : ""}`;
        const data = await slackFetch(url);
        if (!data.ok) { console.error("channels.list error:", data.error); break; }
        allChannels = allChannels.concat(data.channels || []);
        cursor = data.response_metadata?.next_cursor || "";
        if (cursor) await new Promise(r => setTimeout(r, 1500));
      } while (cursor);
      console.log(`Fetched ${allChannels.length} channels for ${clientsNeedingMatch.length} clients needing match`);
      const channelNames = allChannels.map(ch => ch.name).sort();
      console.log(`Available channels: ${channelNames.join(', ')}`);

      for (const c of clientsNeedingMatch) {
        let channel = null;
        // 1. Try exact match on slack_channel_name field
        if (c.slack_channel_name) {
          const manualName = c.slack_channel_name.toLowerCase().replace(/^#/, '').trim();
          channel = allChannels.find(ch => ch.name.toLowerCase() === manualName);
          if (!channel) console.log(`No exact channel match for "${c.name}" with slack_channel_name="${c.slack_channel_name}"`);
        }
        // 2. Fuzzy match on client name
        if (!channel) {
          const normalizedName = c.name.toLowerCase().replace(/[^a-z0-9]/g, '');
          channel = allChannels.find(ch => {
            const chNameStripped = ch.name.toLowerCase().replace(/[^a-z0-9]/g, '');
            return chNameStripped.includes(normalizedName) || normalizedName.includes(chNameStripped);
          });
          if (!channel) console.log(`No fuzzy channel match for "${c.name}" (normalized: "${normalizedName}")`);
        }
        if (channel) {
          console.log(`Matched "${c.name}" -> #${channel.name}`);
          matchable.push({ client: c, channel });
        }
      }
    } else {
      console.log(`${matchable.length} cached-ID clients available, skipping channel list fetch`);
    }

    const BATCH_SIZE = body.batch_size || 8;
    const eligible = matchable.slice(0, BATCH_SIZE);
    console.log(`Batch: processing ${eligible.length} of ${matchable.length} matchable (${clientsNeedingMatch.length} without cached channel ID)`);

    if (eligible.length === 0) {
      return Response.json({ success: true, message: "No matchable clients to analyze", processed: 0 });
    }

    // 4. Fetch GBV staff emails + names once
    let gbvEmails = new Set();
    let gbvNormalizedNames = new Set();
    try {
      const rawUsers = await base44.asServiceRole.entities.User.list("-created_date", 200);
      const appUsers = Array.isArray(rawUsers) ? rawUsers : (rawUsers?.items || rawUsers?.data || rawUsers?.results || []);
      for (const u of appUsers) {
        if (u.email) gbvEmails.add(u.email.toLowerCase());
        if (u.full_name) {
          gbvNormalizedNames.add(u.full_name.toLowerCase().trim());
          const firstName = u.full_name.split(' ')[0].toLowerCase().trim();
          if (firstName.length >= 3) gbvNormalizedNames.add(firstName);
        }
      }
    } catch (e) {
      console.error("Could not fetch app users:", e.message);
    }

    const globalUserMap = {};
    const globalUserIsGbv = {};

    const results = [];
    const errors = [];
    const startTime = Date.now();
    const MAX_RUNTIME_MS = 150000; // 2.5 minutes safe limit

    for (const { client, channel } of eligible) {
      if (Date.now() - startTime > MAX_RUNTIME_MS) {
        console.log(`Time guard: stopping after ${results.length} clients (${Math.round((Date.now() - startTime) / 1000)}s elapsed)`);
        break;
      }

      try {
        console.log(`[ANALYZE] ${client.name} -> #${channel.name}`);

        if (client.slack_channel_id !== channel.id) {
          await base44.asServiceRole.entities.Client.update(client.id, { slack_channel_id: channel.id });
        }

        const since = Math.floor((Date.now() - 30 * 24 * 60 * 60 * 1000) / 1000);
        let allMessages = [];
        let histCursor = "";
        let historyFailed = false;
        let historyError = '';
        do {
          const histUrl = `https://slack.com/api/conversations.history?channel=${channel.id}&oldest=${since}&limit=200${histCursor ? `&cursor=${histCursor}` : ""}`;
          const histData = await slackFetch(histUrl);
          if (!histData.ok) {
            historyError = histData.error || 'unknown';
            console.error(`History error for #${channel.name} (${channel.id}): ${historyError}`);
            historyFailed = true;
            break;
          }
          allMessages = allMessages.concat(histData.messages || []);
          histCursor = histData.response_metadata?.next_cursor || "";
        } while (histCursor);

        if (historyFailed && allMessages.length === 0) {
          console.error(`Skipping ${client.name}: could not fetch any history (${historyError})`);
          errors.push({ client: client.name, error: `Could not fetch history: ${historyError} (channel ${channel.id})` });
          continue;
        }

        const threadParents = allMessages.filter(m => m.reply_count && m.reply_count > 0 && m.ts);
        for (const parent of threadParents) {
          const repliesData = await slackFetch(
            `https://slack.com/api/conversations.replies?channel=${channel.id}&ts=${parent.ts}&oldest=${since}&limit=200`
          );
          if (repliesData.ok && repliesData.messages) {
            const replies = repliesData.messages.filter(r => r.ts !== parent.ts);
            allMessages = allMessages.concat(replies);
          }
        }

        const seenTs = new Set();
        const messages = allMessages
          .filter(m => {
            if (seenTs.has(m.ts)) return false;
            seenTs.add(m.ts);
            return !m.bot_id && m.type === 'message' && !m.subtype && m.text;
          })
          .sort((a, b) => parseFloat(a.ts) - parseFloat(b.ts));

        if (messages.length === 0) {
          console.log(`No messages in #${channel.name}, skipping`);
          continue;
        }

        const uniqueUsers = [...new Set(messages.map(m => m.user).filter(Boolean))];
        for (const uid of uniqueUsers) {
          if (globalUserMap[uid] !== undefined) continue;
          const uData = await slackFetch(`https://slack.com/api/users.info?user=${uid}`);
          if (uData.ok && uData.user) {
            const realName = uData.user.real_name || uData.user.profile?.display_name || uData.user.name || uid;
            globalUserMap[uid] = realName;
            const slackEmail = (uData.user.profile?.email || "").toLowerCase();
            // Match by email first, then fall back to name matching
            let isGbv = slackEmail ? gbvEmails.has(slackEmail) : false;
            if (!isGbv) {
              const slackNameNorm = realName.toLowerCase().trim();
              const slackFirstName = slackNameNorm.split(' ')[0];
              isGbv = gbvNormalizedNames.has(slackNameNorm) || (slackFirstName.length >= 3 && gbvNormalizedNames.has(slackFirstName));
              if (isGbv) console.log(`Matched "${realName}" as GBV staff via name (email "${slackEmail}" didn't match)`);
            }
            globalUserIsGbv[uid] = isGbv;
          } else {
            globalUserMap[uid] = uid;
            globalUserIsGbv[uid] = false;
          }
        }

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

        console.log(`#${channel.name}: ${messages.length} msgs, sending ${Math.min(messages.length, 100)} to LLM`);

        const analysis = await base44.asServiceRole.integrations.Core.InvokeLLM({
          prompt: `You are an AI analyst for a B2B lead generation agency called GBV. Analyze the following Slack messages from a client channel for "${client.name}".

CLIENT CONTEXT:
- Client start date: ${client.start_date || 'Unknown'}
- Package: ${client.package_type || 'Unknown'}
- Current status: ${client.status || 'Unknown'}
- Today's date: ${new Date().toISOString().split('T')[0]}

IMPORTANT: Messages are labeled [GBV STAFF] or [CLIENT]. ${gbvNames.length > 0 ? `Known GBV team members: ${gbvNames.join(', ')}.` : ''} Focus sentiment analysis on CLIENT messages, not agency updates.

CRITICAL: Base sentiment on the client's MOST RECENT messages. Later messages override earlier ones. If no client activity for 14+ days, note silence in risk_signals but base sentiment on last client messages.

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
        if (lastGbvDate && (!client.last_am_touchpoint || lastGbvDate > client.last_am_touchpoint)) {
          updateData.last_am_touchpoint = lastGbvDate;
        }
        if (lastClientDate && (!client.last_client_reply_date || lastClientDate > client.last_client_reply_date)) {
          updateData.last_client_reply_date = lastClientDate;
        }

        if (Object.keys(updateData).length > 0) {
          await base44.asServiceRole.entities.Client.update(client.id, updateData);
        }

        console.log(`OK ${client.name}: ${analysis.sentiment} (score: ${analysis.sentiment_score})`);
        results.push({ client: client.name, sentiment: analysis.sentiment, score: analysis.sentiment_score, messages: messages.length });

      } catch (err) {
        const errMsg = err?.message || String(err);
        console.error(`FAIL ${client.name}: ${errMsg}`);
        errors.push({ client: client.name, error: errMsg });
      }

      await new Promise(r => setTimeout(r, 3000));
    }

    const remaining = needsRefresh.length - results.length - errors.length;
    console.log(`Done: ${results.length} ok, ${errors.length} failed, ${remaining} still pending today`);

    // Auto-chain: only if we actually processed at least 1 client successfully
    // (avoids infinite loop when all clients are rate-limited)
    if (remaining > 0 && results.length > 0) {
      console.log(`Auto-chaining: ${remaining} clients remaining...`);
      try {
        await base44.functions.invoke('slackSentimentBatch', { batch_size: BATCH_SIZE });
        console.log('Auto-chain invoked successfully');
      } catch (e) {
        console.error('Auto-chain invoke failed:', e.message);
      }
    } else if (remaining > 0 && results.length === 0) {
      console.log(`Skipping auto-chain: 0 processed (likely rate-limited). ${remaining} clients still pending. Try again later.`);
    }

    return Response.json({
      success: true,
      processed: results.length,
      failed: errors.length,
      remaining_today: remaining,
      done_today_before: alreadyDoneToday.length,
      total_active: activeClients.length,
      chained: remaining > 0,
      results,
      errors
    });

  } catch (topErr) {
    console.error("Top-level error:", topErr?.message || String(topErr));
    return Response.json({ error: topErr?.message || String(topErr) }, { status: 500 });
  }
});
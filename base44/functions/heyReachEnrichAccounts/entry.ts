import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const API_BASE = "https://api.heyreach.io/api/public";
const BATCH_SIZE = 10;
const ACCOUNTS_PER_RUN = 40; // Process 40 accounts per 5-min run

// Only enrich short periods (leaderboard data)
const SHORT_PERIODS = [1, 7, 14];

function apiHeaders() {
  const key = Deno.env.get("HEYREACH_INTERNAL_API_KEY");
  if (!key) throw new Error("HEYREACH_INTERNAL_API_KEY not set");
  return { "X-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json" };
}

async function fetchSingleAccountStats(aid, start, end) {
  try {
    const res = await fetch(`${API_BASE}/stats/GetOverallStats`, {
      method: "POST", headers: apiHeaders(),
      body: JSON.stringify({ AccountIds: [aid], CampaignIds: [], StartDate: start, EndDate: end }),
    });
    if (res.status === 429) {
      await new Promise(r => setTimeout(r, 2000));
      const retry = await fetch(`${API_BASE}/stats/GetOverallStats`, {
        method: "POST", headers: apiHeaders(),
        body: JSON.stringify({ AccountIds: [aid], CampaignIds: [], StartDate: start, EndDate: end }),
      });
      if (!retry.ok) return null;
      return (await retry.json())?.overallStats || null;
    }
    if (!res.ok) return null;
    return (await res.json())?.overallStats || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // For each short period, find the cache, extract all account IDs from chunks,
    // pick the next batch that hasn't been enriched, fetch stats, and update.
    for (const days of SHORT_PERIODS) {
      const cacheRecords = await base44.asServiceRole.entities.HeyReachCache.filter({ days });
      if (!cacheRecords || cacheRecords.length === 0) continue;

      // Find account chunk records and collect un-enriched account IDs
      const chunkRecords = [];
      const unenrichedIds = [];
      
      for (const rec of cacheRecords) {
        const data = JSON.parse(rec.workspace_data);
        if (data._type !== "accounts_chunk") continue;
        chunkRecords.push(rec);
        for (const acc of (data.accounts || [])) {
          if (!acc._enriched) {
            unenrichedIds.push(acc.id);
          }
        }
      }

      if (unenrichedIds.length === 0) {
        console.log(`[ENRICH-${days}d] All accounts already enriched, skipping`);
        continue;
      }

      // Pick next batch to enrich
      const batch = unenrichedIds.slice(0, ACCOUNTS_PER_RUN);
      console.log(`[ENRICH-${days}d] Enriching ${batch.length}/${unenrichedIds.length} remaining accounts`);

      // Calculate date range for this period
      const now = new Date();
      let start, end;
      if (days === 1) {
        const todayMidnight = new Date(now);
        todayMidnight.setUTCHours(0, 0, 0, 0);
        start = todayMidnight.toISOString();
        end = now.toISOString();
      } else {
        start = new Date(now.getTime() - days * 86400000).toISOString();
        end = now.toISOString();
      }

      // Fetch stats in parallel batches
      const statsMap = {};
      for (let i = 0; i < batch.length; i += BATCH_SIZE) {
        const subBatch = batch.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(
          subBatch.map(async (aid) => ({ id: aid, stats: await fetchSingleAccountStats(aid, start, end) }))
        );
        for (const r of results) {
          if (r.stats) statsMap[r.id] = r.stats;
        }
      }

      const gotStats = Object.keys(statsMap).length;
      console.log(`[ENRICH-${days}d] Got stats for ${gotStats}/${batch.length} accounts`);

      // Mark accounts that returned no stats as enriched (set to -1 to skip next run)
      // Actually, just mark them with a tiny value so we don't re-fetch
      for (const aid of batch) {
        if (!statsMap[aid]) {
          statsMap[aid] = { connectionsSent: 0, totalInmailStarted: 0, totalMessageStarted: 0, _empty: true };
        }
      }

      // Update the account chunk records
      // Wrapped in try/catch per-record because the sync function may have
      // deleted and recreated cache records while we were fetching stats (race condition).
      let updatedCount = 0;
      for (const rec of chunkRecords) {
        const data = JSON.parse(rec.workspace_data);
        let changed = false;
        for (const acc of (data.accounts || [])) {
          const s = statsMap[acc.id];
          if (s) {
            acc.connections = s._empty ? 0 : (s.connectionsSent || 0);
            acc.inmails = s._empty ? 0 : (s.totalInmailStarted || s.inmailMessagesSent || 0);
            acc.messages = s._empty ? 0 : (s.totalMessageStarted || s.messagesSent || 0);
            acc._enriched = true;
            changed = true;
          }
        }
        if (changed) {
          try {
            await base44.asServiceRole.entities.HeyReachCache.update(rec.id, {
              workspace_data: JSON.stringify(data),
            });
            updatedCount++;
          } catch (updateErr) {
            // Record was deleted by a concurrent sync — skip, next run will use new records
            console.log(`[ENRICH-${days}d] Skipped stale record ${rec.id}: ${updateErr.message}`);
          }
        }
      }

      console.log(`[ENRICH-${days}d] Updated ${updatedCount}/${chunkRecords.length} chunk records`);
    }

    return Response.json({ success: true });
  } catch (err) {
    console.error(`[ENRICH] Fatal: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
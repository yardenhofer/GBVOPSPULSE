import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const API_BASE = "https://api.heyreach.io/api/public";
const BATCH_SIZE = 10;

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
    const body = await req.json();
    const { days, start, end, accountIds, chunkIndex, totalChunks } = body;

    if (!days || !accountIds || !start || !end) {
      return Response.json({ error: "Missing parameters" }, { status: 400 });
    }

    // No user auth check — this function is called internally by heyReachSyncPeriod via service role
    console.log(`[ENRICH-${days}d] Chunk ${chunkIndex}/${totalChunks}: ${accountIds.length} accounts`);

    // Fetch per-account stats in parallel batches
    const statsMap = {};
    for (let i = 0; i < accountIds.length; i += BATCH_SIZE) {
      const batch = accountIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (aid) => ({ id: aid, stats: await fetchSingleAccountStats(aid, start, end) }))
      );
      for (const r of results) {
        if (r.stats) statsMap[r.id] = r.stats;
      }
    }

    const gotStats = Object.keys(statsMap).length;
    console.log(`[ENRICH-${days}d] Chunk ${chunkIndex}: got stats for ${gotStats}/${accountIds.length}`);

    if (gotStats === 0) {
      return Response.json({ success: true, enriched: 0 });
    }

    // Read ALL cache records for this period (includes summary + account chunks)
    const cacheRecords = await base44.asServiceRole.entities.HeyReachCache.filter({ days });
    let updatedCount = 0;

    for (const rec of cacheRecords) {
      const ws = JSON.parse(rec.workspace_data);
      const accounts = ws.accounts || [];
      let changed = false;

      for (const acc of accounts) {
        const s = statsMap[acc.id];
        if (s) {
          acc.connections = s.connectionsSent || 0;
          acc.inmails = s.totalInmailStarted || s.inmailMessagesSent || 0;
          acc.messages = s.totalMessageStarted || s.messagesSent || 0;
          changed = true;
          updatedCount++;
        }
      }

      if (changed) {
        await base44.asServiceRole.entities.HeyReachCache.update(rec.id, {
          workspace_data: JSON.stringify(ws),
        });
      }
    }

    console.log(`[ENRICH-${days}d] Chunk ${chunkIndex} done. Updated ${updatedCount} accounts across cache records.`);
    return Response.json({ success: true, enriched: updatedCount });
  } catch (err) {
    console.error(`[ENRICH] Error: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
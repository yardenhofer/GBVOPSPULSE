import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const API_BASE = "https://api.heyreach.io/api/public";
const SHORT_PERIODS = [1, 7, 14];
const BATCH_SIZE = 5; // parallel calls per batch
const BATCH_DELAY = 1200; // ms between batches

function apiHeaders() {
  const key = Deno.env.get("HEYREACH_INTERNAL_API_KEY");
  if (!key) throw new Error("HEYREACH_INTERNAL_API_KEY not set");
  return { "X-API-KEY": key, "Accept": "application/json", "Content-Type": "application/json" };
}

async function fetchWithRetry(url, options, label, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;
    if (res.status === 429) {
      const wait = attempt * 4000;
      console.log(`[RETRY] ${label}: 429, waiting ${wait / 1000}s (attempt ${attempt}/${maxRetries})`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }
    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, 1500));
      continue;
    }
    throw new Error(`${label}: HTTP ${res.status}`);
  }
  throw new Error(`${label}: max retries exceeded`);
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json().catch(() => ({}));

    // Determine which period to enrich this run
    // Cycle: 1d → 7d → 14d → 1d → ...
    // Use an AppSettings record to track which period is next
    const settings = await base44.asServiceRole.entities.AppSettings.filter({ key: "enrich_next_period_idx" });
    let idx = 0;
    if (settings.length > 0) {
      idx = parseInt(settings[0].value || "0", 10);
      if (isNaN(idx) || idx >= SHORT_PERIODS.length) idx = 0;
    }

    const days = body.days || SHORT_PERIODS[idx];
    const nextIdx = (idx + 1) % SHORT_PERIODS.length;

    // Save next index for the next run
    if (settings.length > 0) {
      await base44.asServiceRole.entities.AppSettings.update(settings[0].id, { value: String(nextIdx) });
    } else {
      await base44.asServiceRole.entities.AppSettings.create({ key: "enrich_next_period_idx", value: String(nextIdx) });
    }

    console.log(`[ENRICH-${days}d] Starting enrichment (next run will do ${SHORT_PERIODS[nextIdx]}d)`);

    // Calculate date range
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

    // Load account chunks for this period
    const cacheRecords = await base44.asServiceRole.entities.HeyReachCache.filter({ days });
    const chunkRecords = [];
    const allAccountIds = [];

    for (const rec of cacheRecords) {
      const data = JSON.parse(rec.workspace_data);
      if (data._type !== "accounts_chunk") continue;
      chunkRecords.push(rec);
      for (const acc of (data.accounts || [])) {
        allAccountIds.push(acc.id);
      }
    }

    if (allAccountIds.length === 0) {
      console.log(`[ENRICH-${days}d] No accounts found, skipping`);
      return Response.json({ success: true, days, enriched: 0 });
    }

    console.log(`[ENRICH-${days}d] Enriching ${allAccountIds.length} accounts in batches of ${BATCH_SIZE}`);

    // Fetch per-account stats in small sequential batches
    const statsMap = {};
    for (let i = 0; i < allAccountIds.length; i += BATCH_SIZE) {
      const batch = allAccountIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(async (aid) => {
          try {
            const res = await fetchWithRetry(
              `${API_BASE}/stats/GetOverallStats`,
              { method: "POST", headers: apiHeaders(), body: JSON.stringify({ AccountIds: [aid], CampaignIds: [], StartDate: start, EndDate: end }) },
              `Stats-${aid}`
            );
            const data = await res.json();
            return { id: aid, stats: data?.overallStats || null };
          } catch {
            return { id: aid, stats: null };
          }
        })
      );
      for (const r of results) {
        if (r.stats) statsMap[r.id] = r.stats;
      }
      // Delay between batches to stay under rate limit
      if (i + BATCH_SIZE < allAccountIds.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY));
      }
    }

    console.log(`[ENRICH-${days}d] Got stats for ${Object.keys(statsMap).length}/${allAccountIds.length} accounts`);

    // Update account chunk records
    let updatedChunks = 0;
    for (const rec of chunkRecords) {
      const data = JSON.parse(rec.workspace_data);
      let changed = false;
      for (const acc of (data.accounts || [])) {
        const s = statsMap[acc.id];
        if (s) {
          acc.connections = s.connectionsSent || 0;
          acc.inmails = s.totalInmailStarted || s.inmailMessagesSent || 0;
          acc.messages = s.totalMessageStarted || s.messagesSent || 0;
          acc._enriched = true;
          changed = true;
        }
      }
      if (changed) {
        try {
          await base44.asServiceRole.entities.HeyReachCache.update(rec.id, {
            workspace_data: JSON.stringify(data),
          });
          updatedChunks++;
        } catch (e) {
          console.log(`[ENRICH-${days}d] Skip stale record: ${e.message}`);
        }
      }
    }

    console.log(`[ENRICH-${days}d] Updated ${updatedChunks} chunk records`);
    return Response.json({ success: true, days, enriched: Object.keys(statsMap).length, total: allAccountIds.length });
  } catch (err) {
    console.error(`[ENRICH] Fatal: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
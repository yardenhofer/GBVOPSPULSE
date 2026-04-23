import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const PERIODS = [1, 7, 14, 30, 60, 90];

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);

  console.log(`[HEYREACH-SYNC] Starting cache sync for periods: ${PERIODS.join(", ")}`);

  for (const days of PERIODS) {
    try {
      console.log(`[HEYREACH-SYNC] Fetching ${days}d stats...`);
      const resp = await base44.asServiceRole.functions.invoke("heyReachAccountStats", { days });
      const workspaces = resp.data?.workspaces || [];

      // Delete old cache entries for this period
      const existing = await base44.asServiceRole.entities.HeyReachCache.filter({ days });
      for (const rec of existing) {
        await base44.asServiceRole.entities.HeyReachCache.delete(rec.id);
      }

      // Write new cache entries
      const now = new Date().toISOString();
      for (const ws of workspaces) {
        await base44.asServiceRole.entities.HeyReachCache.create({
          days,
          client_id: ws.client_id,
          client_name: ws.client_name,
          workspace_data: JSON.stringify(ws),
          synced_at: now,
        });
      }

      console.log(`[HEYREACH-SYNC] Cached ${workspaces.length} workspaces for ${days}d`);
    } catch (err) {
      console.error(`[HEYREACH-SYNC] Error syncing ${days}d: ${err.message}`);
    }
  }

  console.log(`[HEYREACH-SYNC] Cache sync complete`);
  return Response.json({ success: true });
});
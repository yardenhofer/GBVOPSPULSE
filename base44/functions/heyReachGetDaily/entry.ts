import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const date = body.date;
    if (!date) {
      return Response.json({ error: "Missing 'date' parameter" }, { status: 400 });
    }

    // Fetch all snapshot records for this date
    const records = await base44.asServiceRole.entities.HeyReachDailySnapshot.filter({ date });
    if (!records || records.length === 0) {
      return Response.json({ workspaces: null }); // null = not cached
    }

    // Parse and separate summary vs account chunks
    let summaryData = null;
    const accountChunks = [];

    for (const r of records) {
      if (!r.workspace_data) continue;
      try {
        const parsed = JSON.parse(r.workspace_data);
        if (r.snapshot_type === "summary") {
          summaryData = parsed;
        } else if (r.snapshot_type === "accounts_chunk") {
          accountChunks.push(...parsed);
        }
      } catch (e) {
        console.log(`[GET-DAILY] Parse error for record ${r.id}: ${e.message}`);
      }
    }

    if (!summaryData || !Array.isArray(summaryData)) {
      return Response.json({ workspaces: null });
    }

    // Merge accounts back into workspaces
    for (const ws of summaryData) {
      ws.accounts = accountChunks.filter(a => a._wsId === ws.client_id).map(a => {
        const { _wsId, ...rest } = a;
        return rest;
      });
      if (ws.summary) {
        ws.summary.total_accounts = ws.accounts.length;
      }
    }

    const synced_at = records[0]?.created_date || null;
    return Response.json({ workspaces: summaryData, synced_at });
  } catch (err) {
    console.error(`[GET-DAILY] Error: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
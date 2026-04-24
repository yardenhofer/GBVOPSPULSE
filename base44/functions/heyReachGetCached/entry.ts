import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const days = body.days;
    if (!days) {
      return Response.json({ error: "Missing 'days' parameter" }, { status: 400 });
    }

    // Use service role to read all cache records — no size limits on backend
    const records = await base44.asServiceRole.entities.HeyReachCache.filter({ days });

    if (!records || records.length === 0) {
      return Response.json({ workspaces: [], synced_at: null });
    }

    // Separate main workspace records from account chunks
    const mainRecords = [];
    const accountChunks = [];

    for (const r of records) {
      if (!r.workspace_data) continue;
      try {
        const parsed = JSON.parse(r.workspace_data);
        if (parsed._type === "accounts_chunk") {
          accountChunks.push(parsed);
        } else {
          mainRecords.push(parsed);
        }
      } catch (e) {
        console.log(`[GET-CACHED] Failed to parse record ${r.id}: ${e.message}`);
      }
    }

    // Merge account chunks into their parent workspace
    for (const ws of mainRecords) {
      const chunks = accountChunks.filter(c => c.parent_client_id === ws.client_id);
      if (chunks.length > 0) {
        const mergedAccounts = [];
        for (const chunk of chunks) {
          mergedAccounts.push(...(chunk.accounts || []));
        }
        ws.accounts = mergedAccounts;
        ws.summary = ws.summary || {};
        ws.summary.total_accounts = mergedAccounts.length;
      }
    }

    mainRecords.sort((a, b) => (a.client_name || '').localeCompare(b.client_name || ''));

    // Get synced_at from the first record
    const synced_at = records[0].synced_at || records[0].updated_date || null;

    return Response.json({ workspaces: mainRecords, synced_at });
  } catch (err) {
    console.error(`[GET-CACHED] Error: ${err.message}`);
    return Response.json({ error: err.message }, { status: 500 });
  }
});
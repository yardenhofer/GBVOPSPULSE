import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';

async function fetchInstantly(path, apiKey) {
  const res = await fetch(`${INSTANTLY_API}${path}`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
  });
  if (!res.ok) return null;
  return res.json();
}

async function countAccountHealth(apiKey) {
  let total = 0, errors = 0;
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    let url = `/accounts?limit=100`;
    if (cursor) url += `&starting_after=${encodeURIComponent(cursor)}`;
    const res = await fetchInstantly(url, apiKey);
    if (!res) break;
    const items = res?.items || [];
    for (const a of items) {
      total++;
      if (a.status < 0) errors++;
    }
    cursor = res?.next_starting_after;
    if (!cursor || items.length < 100) break;
  }
  return { total, errors, error_pct: total > 0 ? Math.round((errors / total) * 100) : 0 };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (user?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const today = new Date().toISOString().split('T')[0];

    // If action=trend, return recent snapshots for trend detection
    if (body.action === 'trend') {
      const snapshots = await base44.asServiceRole.entities.InfraHealthSnapshot.list('-date', 500);
      // Group by client_id, last 5 days
      const byClient = {};
      for (const s of snapshots) {
        if (!byClient[s.client_id]) byClient[s.client_id] = [];
        if (byClient[s.client_id].length < 5) byClient[s.client_id].push(s);
      }
      return Response.json({ byClient });
    }

    // Default action: take today's snapshot
    const clients = await base44.asServiceRole.entities.Client.filter({});
    const withKey = clients.filter(c => c.instantly_api_key && c.status !== 'Terminated');

    // Check if we already have today's snapshot
    const existing = await base44.asServiceRole.entities.InfraHealthSnapshot.filter({ date: today });
    const existingIds = new Set(existing.map(e => e.client_id));

    let created = 0;
    for (const client of withKey) {
      if (existingIds.has(client.id)) continue;
      const health = await countAccountHealth(client.instantly_api_key);
      await base44.asServiceRole.entities.InfraHealthSnapshot.create({
        client_id: client.id,
        client_name: client.name,
        date: today,
        total_accounts: health.total,
        error_accounts: health.errors,
        error_pct: health.error_pct,
      });
      created++;
    }

    return Response.json({ success: true, date: today, created, skipped: existingIds.size });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 500 });
  }
});
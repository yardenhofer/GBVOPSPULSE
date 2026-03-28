import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';

async function fetchInstantly(path, apiKey) {
  const res = await fetch(`${INSTANTLY_API}${path}`, {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) return null;
  return res.json();
}

async function fetchAllAccounts(apiKey) {
  let allAccounts = [];
  const limit = 100;
  let cursor = null;
  const MAX_PAGES = 20;
  let page = 0;
  while (page < MAX_PAGES) {
    let url = `/accounts?limit=${limit}`;
    if (cursor) url += `&starting_after=${encodeURIComponent(cursor)}`;
    const res = await fetchInstantly(url, apiKey);
    if (!res) break;
    const items = res?.items || [];
    allAccounts = allAccounts.concat(items);
    cursor = res?.next_starting_after;
    if (!cursor || items.length < limit) break;
    page++;
  }
  return allAccounts;
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const rawClients = await base44.entities.Client.filter({});
    const clients = Array.isArray(rawClients) ? rawClients : (rawClients?.items || rawClients?.data || rawClients?.results || []);
    const clientsWithKey = clients.filter(c => c.instantly_api_key);

    const results = [];

    for (const client of clientsWithKey) {
      const accounts = await fetchAllAccounts(client.instantly_api_key);
      const total = accounts.length;
      const errorAccounts = accounts.filter(a => a.status < 0);
      const errors = errorAccounts.length;
      const errorPct = total > 0 ? Math.round((errors / total) * 100) : 0;

      if (errors > 0) {
        results.push({
          client_id: client.id,
          client_name: client.name,
          assigned_am: client.assigned_am,
          total,
          active: accounts.filter(a => a.status === 1).length,
          errors,
          error_pct: errorPct,
          alert: errorPct > 5,
          error_accounts: errorAccounts.map(a => ({
            email: a.email,
            status: a.status,
            status_label: a.status === -1 ? 'Connection Error' : a.status === -2 ? 'Soft Bounce Error' : a.status === -3 ? 'Sending Error' : 'Unknown',
          })),
        });
      }
    }

    return Response.json({ results });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
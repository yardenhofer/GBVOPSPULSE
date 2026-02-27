import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

const INSTANTLY_API = 'https://api.instantly.ai/api/v2';
const API_KEY = Deno.env.get('INSTANTLY_API_KEY');

async function fetchInstantly(path, options = {}) {
  const res = await fetch(`${INSTANTLY_API}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Instantly API error ${res.status}: ${text}`);
  }
  return res.json();
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { client_id } = body;

    // Get list of campaigns from Instantly (optionally filtered by client workspace)
    // Instantly V2 uses one API key per workspace, so all campaigns belong to this workspace
    // We'll aggregate stats across all campaigns for the given client
    // Each client maps to their own Instantly workspace via a separate API key stored per client,
    // but since we use a global key, we match by client name tag or just pull all.

    // Fetch campaigns overview analytics
    // GET /api/v2/campaigns/analytics — returns array of per-campaign stats (no id = all campaigns)
    const analyticsRes = await fetchInstantly('/campaigns/analytics');

    const items = Array.isArray(analyticsRes) ? analyticsRes : [];

    // Return raw first item keys so we can see actual field names
    if (items.length > 0) {
      return Response.json({ _debug_keys: Object.keys(items[0]), _debug_item: items[0] });
    }

    return Response.json({ _debug: 'no items', raw: analyticsRes });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

function maskApiKey(key) {
  if (!key) return "••••••••";
  if (key.length <= 8) return key.substring(0, 2) + "••••••";
  return key.substring(0, 4) + "••••" + key.substring(key.length - 4);
}

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden: Admin access required" }, { status: 403 });
  }

  const body = await req.json();
  const { action } = body;

  // ── list: return workspaces with masked keys ──
  if (action === "list") {
    const workspaces = await base44.asServiceRole.entities.InstantlyWorkspace.list("-created_date", 100);
    const safe = workspaces.map(ws => ({
      id: ws.id,
      name: ws.name,
      api_key_masked: maskApiKey(ws.api_key),
      is_default: ws.is_default,
      created_date: ws.created_date,
    }));
    return Response.json({ workspaces: safe });
  }

  // ── create: store workspace with real key ──
  if (action === "create") {
    const { name, api_key } = body;
    if (!name || !api_key) return Response.json({ error: "name and api_key required" }, { status: 400 });
    const ws = await base44.asServiceRole.entities.InstantlyWorkspace.create({
      name: name.trim(),
      api_key: api_key.trim(),
    });
    return Response.json({
      id: ws.id,
      name: ws.name,
      api_key_masked: maskApiKey(api_key.trim()),
      is_default: ws.is_default,
    });
  }

  // ── update: update name and/or key ──
  if (action === "update") {
    const { id, name, api_key } = body;
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    const updates = {};
    if (name) updates.name = name.trim();
    if (api_key) updates.api_key = api_key.trim();
    if (Object.keys(updates).length === 0) return Response.json({ error: "Nothing to update" }, { status: 400 });
    await base44.asServiceRole.entities.InstantlyWorkspace.update(id, updates);
    // Fetch updated record to return masked key
    const updated = await base44.asServiceRole.entities.InstantlyWorkspace.filter({ id });
    const ws = updated[0];
    return Response.json({
      id: ws.id,
      name: ws.name,
      api_key_masked: maskApiKey(ws.api_key),
      is_default: ws.is_default,
    });
  }

  // ── setDefault ──
  if (action === "setDefault") {
    const { id } = body;
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    // Unset all defaults
    const all = await base44.asServiceRole.entities.InstantlyWorkspace.list("-created_date", 100);
    for (const ws of all) {
      if (ws.is_default) await base44.asServiceRole.entities.InstantlyWorkspace.update(ws.id, { is_default: false });
    }
    await base44.asServiceRole.entities.InstantlyWorkspace.update(id, { is_default: true });
    return Response.json({ success: true });
  }

  // ── delete ──
  if (action === "delete") {
    const { id } = body;
    if (!id) return Response.json({ error: "id required" }, { status: 400 });
    await base44.asServiceRole.entities.InstantlyWorkspace.delete(id);
    return Response.json({ success: true });
  }

  return Response.json({ error: `Unknown action: ${action}` }, { status: 400 });
});
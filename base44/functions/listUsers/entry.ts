import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();

  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (user.role !== 'admin') {
    return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const { action, user_id, data } = body;

  // Update a user
  if (action === 'update' && user_id && data) {
    const updated = await base44.asServiceRole.entities.User.update(user_id, data);
    return Response.json({ user: updated });
  }

  // Delete a user
  if (action === 'delete' && user_id) {
    if (user_id === user.id) {
      return Response.json({ error: 'Cannot delete yourself' }, { status: 400 });
    }
    await base44.asServiceRole.entities.User.delete(user_id);
    return Response.json({ success: true });
  }

  // Default: list users
  const users = await base44.asServiceRole.entities.User.list("-created_date", 200);
  return Response.json({ users });
});
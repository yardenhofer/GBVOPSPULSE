import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  console.log('step 1: created client');
  
  const clients = await base44.asServiceRole.entities.Client.filter({
    status: 'Off-Boarding'
  });
  console.log('step 2: got clients', clients.length);

  return Response.json({ ok: true, count: clients.length });
});
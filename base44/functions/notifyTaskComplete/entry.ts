import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

Deno.serve(async (req) => {
  const base44 = createClientFromRequest(req);
  const user = await base44.auth.me();
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { task_id } = await req.json();
  if (!task_id) return Response.json({ error: 'task_id required' }, { status: 400 });

  const tasks = await base44.asServiceRole.entities.OpsTask.filter({ id: task_id });
  if (tasks.length === 0) return Response.json({ error: 'Task not found' }, { status: 404 });
  const task = tasks[0];

  const webhookUrl = Deno.env.get("SLACK_WEBHOOK_URL_OPS_ALERTS");
  if (!webhookUrl) return Response.json({ error: "No Slack webhook" }, { status: 500 });

  const priorityEmoji = { critical: "🔴", high: "🟠", medium: "🟡", low: "🟢" };

  const payload = {
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `✅ *Task Completed*\n*${task.client_name}* — ${task.task_type || "task"}\nCompleted by ${user.full_name || user.email}`
        }
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: `*What was changed:*\n${task.feedback || "No details provided"}`
        }
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `${priorityEmoji[task.priority] || "🟡"} ${task.priority} priority • AM: ${task.am_email || "—"} • Please acknowledge in Ops Center`
          }
        ]
      }
    ]
  };

  const resp = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  return Response.json({ success: resp.ok });
});
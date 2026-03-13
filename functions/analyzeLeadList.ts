import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { approval_id } = await req.json();
    if (!approval_id) return Response.json({ error: 'Missing approval_id' }, { status: 400 });

    // Fetch the approval record
    const approval = await base44.asServiceRole.entities.LeadListApproval.get(approval_id);
    if (!approval) return Response.json({ error: 'Approval not found' }, { status: 404 });

    // Fetch the client
    const client = await base44.asServiceRole.entities.Client.get(approval.client_id);
    if (!client) return Response.json({ error: 'Client not found' }, { status: 404 });

    // Fetch CSV content if file type
    let csvSample = "";
    if (approval.list_type === "file" && approval.file_url) {
      try {
        const csvRes = await fetch(approval.file_url);
        if (csvRes.ok) {
          const fullText = await csvRes.text();
          // Take first 100 rows to stay within token limits
          const lines = fullText.split('\n');
          csvSample = lines.slice(0, Math.min(101, lines.length)).join('\n');
          if (lines.length > 101) {
            csvSample += `\n... (${lines.length - 101} more rows, ${lines.length - 1} total leads)`;
          }
        }
      } catch (e) {
        csvSample = "(Could not fetch CSV file)";
      }
    }

    // Build context about the client
    const clientContext = [
      `Client Name: ${client.name}`,
      `Package Type: ${client.package_type || 'Not set'}`,
      `Status: ${client.status || 'Unknown'}`,
      `Target Leads/Week: ${client.target_leads_per_week || 'Not set'}`,
      client.email_copy ? `Current Email Copy/Sequence:\n${client.email_copy}` : null,
      client.dq_link ? `Discovery Questionnaire Link: ${client.dq_link}` : null,
      client.client_feedback ? `Recent Client Feedback: ${client.client_feedback}` : null,
      client.notes ? `Client Notes: ${client.notes}` : null,
    ].filter(Boolean).join('\n');

    // If DQ link exists, try to fetch its content for extra context
    let dqContent = "";
    if (client.dq_link) {
      try {
        dqContent = `\nNote: The client has a Discovery Questionnaire at: ${client.dq_link}. Consider that the lead list should align with the client's ICP and target criteria defined in their DQ.`;
      } catch (e) {
        // ignore
      }
    }

    const prompt = `You are an expert lead list quality analyst for a B2B outreach agency. Analyze the following lead list submission and score it based on quality, relevance to the client's goals, and likelihood of generating positive responses.

CLIENT CONTEXT:
${clientContext}
${dqContent}

LEAD LIST SUBMISSION:
List Name: ${approval.list_name}
AM Notes: ${approval.notes || 'None provided'}
Lead Count: ${approval.lead_count || 'Unknown'}

CSV DATA (sample):
${csvSample || '(No CSV data available - this is a link-based list)'}
${approval.list_type === "link" ? `Link: ${approval.link_url}` : ""}

ANALYSIS INSTRUCTIONS:
1. Evaluate the lead list quality based on:
   - Column structure (does it have essential fields like name, company, title, email?)
   - ICP alignment with the client's goals, package type, and email copy
   - Data completeness and consistency
   - Title/seniority relevance
   - Industry/company relevance if discernible
   - Volume appropriateness vs the client's weekly target

2. Provide your analysis as a JSON object with these fields:
   - score: number 1-100 (quality score)
   - summary: string (2-3 sentence overview of the list quality)
   - strengths: array of strings (top 3 strengths)
   - concerns: array of strings (top 3 concerns, empty array if none)
   - recommendation: one of "Approve", "Review Carefully", "Deny"

Be practical and specific. Reference actual column names and data patterns you observe.`;

    const result = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          score: { type: "number" },
          summary: { type: "string" },
          strengths: { type: "array", items: { type: "string" } },
          concerns: { type: "array", items: { type: "string" } },
          recommendation: { type: "string" }
        }
      }
    });

    // Save results to the approval record
    await base44.asServiceRole.entities.LeadListApproval.update(approval_id, {
      ai_score: result.score,
      ai_summary: result.summary,
      ai_strengths: (result.strengths || []).join("|||"),
      ai_concerns: (result.concerns || []).join("|||"),
      ai_recommendation: result.recommendation,
      ai_analyzed_date: new Date().toISOString(),
    });

    return Response.json({
      score: result.score,
      summary: result.summary,
      strengths: result.strengths,
      concerns: result.concerns,
      recommendation: result.recommendation,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
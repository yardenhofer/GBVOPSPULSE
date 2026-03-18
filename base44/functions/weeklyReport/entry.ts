import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import { jsPDF } from 'npm:jspdf@4.0.0';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 });

    const clients = await base44.entities.Client.list('-updated_date', 200);
    const today = new Date().toISOString().slice(0, 10);

    const doc = new jsPDF();
    const pageW = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageW, 28, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('OpsControl — Weekly Client Report', 14, 18);

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Generated: ${today}`, pageW - 14, 18, { align: 'right' });

    // Summary
    const critical = clients.filter(c => c.status === 'Critical').length;
    const atRisk = clients.filter(c => c.status === 'At Risk').length;
    const healthy = clients.filter(c => c.status === 'Healthy').length;
    const revenueAtRisk = clients.filter(c => ['Critical', 'At Risk'].includes(c.status))
      .reduce((s, c) => s + (c.revenue || 0), 0);

    doc.setTextColor(30, 41, 59);
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.text('Summary', 14, 40);

    const summaryItems = [
      [`Total Clients`, `${clients.length}`],
      [`Healthy`, `${healthy}`],
      [`At Risk`, `${atRisk}`],
      [`Critical`, `${critical}`],
      [`Revenue at Risk`, `$${revenueAtRisk.toLocaleString()}/mo`],
    ];

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    let sy = 47;
    summaryItems.forEach(([label, val]) => {
      doc.setTextColor(100, 116, 139);
      doc.text(label, 14, sy);
      doc.setTextColor(30, 41, 59);
      doc.setFont('helvetica', 'bold');
      doc.text(val, 70, sy);
      doc.setFont('helvetica', 'normal');
      sy += 6;
    });

    // Client table
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text('Client Status', 14, sy + 8);

    // Table header
    let ty = sy + 14;
    doc.setFillColor(241, 245, 249);
    doc.rect(14, ty - 5, pageW - 28, 7, 'F');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Client', 16, ty);
    doc.text('AM', 70, ty);
    doc.text('Package', 110, ty);
    doc.text('Status', 140, ty);
    doc.text('Leads/Wk', 170, ty);
    ty += 5;

    const statusColors = {
      'Critical': [239, 68, 68],
      'At Risk': [249, 115, 22],
      'Monitor': [234, 179, 8],
      'Healthy': [34, 197, 94],
    };

    clients.forEach((c) => {
      if (ty > 270) {
        doc.addPage();
        ty = 20;
      }
      doc.setDrawColor(226, 232, 240);
      doc.line(14, ty, pageW - 14, ty);
      ty += 4;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      doc.text((c.name || '').slice(0, 28), 16, ty);
      doc.setTextColor(100, 116, 139);
      doc.text((c.assigned_am || '—').slice(0, 22), 70, ty);
      doc.text(c.package_type || '—', 110, ty);

      const sc = statusColors[c.status] || [100, 116, 139];
      doc.setTextColor(...sc);
      doc.setFont('helvetica', 'bold');
      doc.text(c.status || '—', 140, ty);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(30, 41, 59);
      const leadsText = c.target_leads_per_week
        ? `${c.leads_this_week ?? 0}/${c.target_leads_per_week}`
        : `${c.leads_this_week ?? 0}`;
      doc.text(leadsText, 170, ty);
      ty += 6;
    });

    // Footer
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('OpsControl · Confidential', 14, 290);
    doc.text(`Page 1`, pageW - 14, 290, { align: 'right' });

    const pdfBytes = doc.output('arraybuffer');
    return new Response(pdfBytes, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=ops-report-${today}.pdf`,
      },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});
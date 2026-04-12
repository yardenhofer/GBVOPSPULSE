import { Mail, Send, Target, AlertTriangle, CheckCircle, XCircle, Users } from "lucide-react";

export default function OpsMetricCards({ rows, checkIns, isWeekend }) {
  const submitted = rows.filter(r => r.checkIn);
  const missing = isWeekend ? [] : rows.filter(r => !r.checkIn);
  const expectedTotal = isWeekend ? submitted.length : rows.length;
  
  const totalEmails = checkIns.reduce((s, c) => s + (c.emails_sent || 0), 0);
  const totalInmails = checkIns.reduce((s, c) => s + (c.inmails_sent || 0), 0);
  const totalLeads = checkIns.reduce((s, c) => s + (c.leads_generated || 0), 0);
  
  const belowKpi = rows.filter(r => {
    const target = r.client?.target_leads_per_week || 5;
    const leads = (r.client?.leads_this_week || 0) + (r.checkIn?.leads_generated || 0);
    return leads < target;
  });
  
  const avgSat = (() => {
    const rated = checkIns.filter(c => c.satisfaction_rate != null && c.satisfaction_rate > 0);
    if (rated.length === 0) return null;
    return (rated.reduce((s, c) => s + c.satisfaction_rate, 0) / rated.length).toFixed(1);
  })();

  const cards = [
    { label: "Check-Ins", value: `${submitted.length}/${expectedTotal}`, icon: CheckCircle, color: submitted.length === expectedTotal && expectedTotal > 0 ? "text-green-500" : "text-blue-500", bg: submitted.length === expectedTotal && expectedTotal > 0 ? "bg-green-500/10" : "bg-blue-500/10" },
    { label: "Missing", value: missing.length, icon: XCircle, color: missing.length > 0 ? "text-red-500" : "text-green-500", bg: missing.length > 0 ? "bg-red-500/10" : "bg-green-500/10" },
    { label: "Below KPI", value: belowKpi.length, icon: AlertTriangle, color: belowKpi.length > 0 ? "text-orange-500" : "text-green-500", bg: belowKpi.length > 0 ? "bg-orange-500/10" : "bg-green-500/10" },
    { label: "Emails Sent", value: totalEmails, icon: Mail, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "InMails Sent", value: totalInmails, icon: Send, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Leads Today", value: totalLeads, icon: Target, color: "text-emerald-500", bg: "bg-emerald-500/10" },
    { label: "Avg Satisfaction", value: avgSat ? `${avgSat}/10` : "—", icon: Users, color: avgSat && Number(avgSat) >= 7 ? "text-green-500" : avgSat && Number(avgSat) >= 4 ? "text-yellow-500" : "text-red-500", bg: avgSat && Number(avgSat) >= 7 ? "bg-green-500/10" : avgSat && Number(avgSat) >= 4 ? "bg-yellow-500/10" : "bg-red-500/10" },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
      {cards.map(({ label, value, icon: Icon, color, bg }) => (
        <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <div className={`w-7 h-7 rounded-lg ${bg} flex items-center justify-center`}>
              <Icon className={`w-3.5 h-3.5 ${color}`} />
            </div>
          </div>
          <p className={`text-xl font-bold ${color}`}>{value}</p>
          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
        </div>
      ))}
    </div>
  );
}
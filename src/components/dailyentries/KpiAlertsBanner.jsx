import { AlertTriangle, Clock, XCircle } from "lucide-react";

export default function KpiAlertsBanner({ rows, userMap }) {
  const alerts = [];

  // Clients below KPI
  const belowKpi = rows.filter(r => {
    const target = r.client?.target_leads_per_week || 5;
    const leads = (r.client?.leads_this_week || 0) + (r.checkIn?.leads_generated || 0);
    return leads < target;
  });

  // AMs who haven't submitted
  const missingAms = {};
  rows.filter(r => !r.checkIn).forEach(r => {
    const am = r.client?.assigned_am;
    if (!am) return;
    if (!missingAms[am]) missingAms[am] = [];
    missingAms[am].push(r.client.name);
  });

  // Low satisfaction
  const lowSat = rows.filter(r => r.checkIn?.satisfaction_rate != null && r.checkIn.satisfaction_rate <= 4);

  if (Object.keys(missingAms).length === 0 && belowKpi.length === 0 && lowSat.length === 0) {
    return (
      <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 flex items-center gap-3">
        <span className="text-lg">✅</span>
        <p className="text-sm font-medium text-green-600 dark:text-green-400">All clear — every AM has submitted and all clients are on track.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {Object.entries(missingAms).map(([am, clientNames]) => (
        <div key={am} className="bg-red-500/10 border border-red-500/20 rounded-xl p-3.5 flex items-start gap-3">
          <XCircle className="w-4.5 h-4.5 text-red-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-red-600 dark:text-red-400">
              {userMap[am] || am} — Missing check-ins
            </p>
            <p className="text-xs text-red-500/80 mt-0.5">
              {clientNames.join(", ")}
            </p>
          </div>
        </div>
      ))}

      {belowKpi.length > 0 && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-3.5 flex items-start gap-3">
          <AlertTriangle className="w-4.5 h-4.5 text-orange-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-orange-600 dark:text-orange-400">
              {belowKpi.length} client{belowKpi.length !== 1 ? "s" : ""} below KPI target
            </p>
            <p className="text-xs text-orange-500/80 mt-0.5">
              {belowKpi.map(r => r.client.name).join(", ")}
            </p>
          </div>
        </div>
      )}

      {lowSat.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3.5 flex items-start gap-3">
          <Clock className="w-4.5 h-4.5 text-yellow-500 mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
              {lowSat.length} client{lowSat.length !== 1 ? "s" : ""} with low satisfaction (≤4/10)
            </p>
            <p className="text-xs text-yellow-500/80 mt-0.5">
              {lowSat.map(r => `${r.client.name} (${r.checkIn.satisfaction_rate}/10)`).join(", ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
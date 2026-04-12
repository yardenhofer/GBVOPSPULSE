import { CheckCircle, XCircle } from "lucide-react";

export default function AmPerformanceGrid({ rows, userMap, isWeekend }) {
  // Group by AM
  const amData = {};
  rows.forEach(({ client, checkIn }) => {
    const am = client.assigned_am;
    if (!am) return;
    if (!amData[am]) amData[am] = { total: 0, submitted: 0, emails: 0, inmails: 0, leads: 0, belowKpi: 0, satSum: 0, satCount: 0 };
    amData[am].total++;
    if (checkIn) {
      amData[am].submitted++;
      amData[am].emails += checkIn.emails_sent || 0;
      amData[am].inmails += checkIn.inmails_sent || 0;
      amData[am].leads += checkIn.leads_generated || 0;
      if (checkIn.satisfaction_rate != null && checkIn.satisfaction_rate > 0) {
        amData[am].satSum += checkIn.satisfaction_rate;
        amData[am].satCount++;
      }
    }
    const target = client.target_leads_per_week || 5;
    const weekLeads = (client.leads_this_week || 0) + (checkIn?.leads_generated || 0);
    if (weekLeads < target) amData[am].belowKpi++;
  });

  const ams = Object.entries(amData).sort((a, b) => {
    // Sort by completion rate descending
    const pctA = a[1].submitted / a[1].total;
    const pctB = b[1].submitted / b[1].total;
    return pctA - pctB;
  });

  if (ams.length === 0) return null;

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">AM Performance</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {ams.map(([email, d]) => {
          const allDone = d.submitted === d.total;
          const avgSat = d.satCount > 0 ? (d.satSum / d.satCount).toFixed(1) : null;
          return (
            <div key={email} className={`rounded-xl border p-4 ${
              (allDone || isWeekend)
                ? "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800" 
                : "bg-red-500/5 border-red-200 dark:border-red-500/20"
            }`}>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{userMap[email] || email}</p>
                  <p className="text-[11px] text-gray-500">{email}</p>
                </div>
                {(allDone || isWeekend) ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : (
                  <span className="text-xs font-semibold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">
                    {d.total - d.submitted} missing
                  </span>
                )}
              </div>
              <div className="grid grid-cols-4 gap-2 text-center">
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{d.emails}</p>
                  <p className="text-[10px] text-gray-500">Emails</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{d.inmails}</p>
                  <p className="text-[10px] text-gray-500">InMails</p>
                </div>
                <div>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">{d.leads}</p>
                  <p className="text-[10px] text-gray-500">Leads</p>
                </div>
                <div>
                  <p className={`text-lg font-bold ${
                    avgSat && Number(avgSat) >= 7 ? "text-green-500" : avgSat && Number(avgSat) >= 4 ? "text-yellow-500" : avgSat ? "text-red-500" : "text-gray-400"
                  }`}>{avgSat || "—"}</p>
                  <p className="text-[10px] text-gray-500">Avg Sat</p>
                </div>
              </div>
              {d.belowKpi > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                  <p className="text-[11px] text-orange-500 font-medium">⚠️ {d.belowKpi} client{d.belowKpi > 1 ? "s" : ""} below KPI</p>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
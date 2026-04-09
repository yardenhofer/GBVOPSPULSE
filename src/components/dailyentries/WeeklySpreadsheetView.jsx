import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { format, addDays, startOfWeek } from "date-fns";

export default function WeeklySpreadsheetView({ clients, weekCheckIns, weekStart, userMap, filterAm }) {
  const navigate = useNavigate();

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = addDays(weekStart, i);
    return { date: format(d, "yyyy-MM-dd"), label: format(d, "EEE"), dayNum: format(d, "d"), full: format(d, "MMM d") };
  });

  const today = format(new Date(), "yyyy-MM-dd");

  const activeClients = clients
    .filter(c => c.assigned_am && c.status !== "Terminated")
    .filter(c => filterAm === "all" || c.assigned_am === filterAm)
    .sort((a, b) => a.name.localeCompare(b.name));

  // Build lookup: clientId -> date -> checkIn
  const checkInMap = {};
  weekCheckIns.forEach(ci => {
    const key = `${ci.client_id}_${ci.date}`;
    checkInMap[key] = ci;
  });

  // Compute daily totals
  const dayTotals = days.map(d => {
    let emails = 0, inmails = 0, leads = 0, entries = 0;
    activeClients.forEach(c => {
      const ci = checkInMap[`${c.id}_${d.date}`];
      if (ci) {
        entries++;
        emails += ci.emails_sent || 0;
        inmails += ci.inmails_sent || 0;
        leads += ci.leads_generated || 0;
      }
    });
    return { emails, inmails, leads, entries };
  });

  // Client weekly totals
  function clientWeekTotals(clientId) {
    let emails = 0, inmails = 0, leads = 0, satSum = 0, satCount = 0, entries = 0;
    days.forEach(d => {
      const ci = checkInMap[`${clientId}_${d.date}`];
      if (ci) {
        entries++;
        emails += ci.emails_sent || 0;
        inmails += ci.inmails_sent || 0;
        leads += ci.leads_generated || 0;
        if (ci.satisfaction_rate != null && ci.satisfaction_rate > 0) {
          satSum += ci.satisfaction_rate;
          satCount++;
        }
      }
    });
    return { emails, inmails, leads, avgSat: satCount > 0 ? (satSum / satCount).toFixed(1) : null, entries };
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-gray-50 dark:bg-gray-800/50">
              <th className="text-left px-3 py-2.5 font-semibold text-gray-700 dark:text-gray-300 sticky left-0 bg-gray-50 dark:bg-gray-800/50 z-10 min-w-[180px]">
                Client
              </th>
              <th className="text-left px-2 py-2.5 font-medium text-gray-500 min-w-[80px]">AM</th>
              {days.map(d => (
                <th key={d.date} className={`text-center px-2 py-2.5 font-semibold min-w-[90px] ${
                  d.date === today ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"
                }`}>
                  <div>{d.label}</div>
                  <div className="text-[10px] font-normal text-gray-400">{d.full}</div>
                </th>
              ))}
              <th className="text-center px-2 py-2.5 font-semibold text-gray-700 dark:text-gray-300 min-w-[80px] bg-gray-100 dark:bg-gray-800">
                Week Total
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
            {activeClients.map(client => {
              const totals = clientWeekTotals(client.id);
              return (
                <tr key={client.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                  <td
                    className="px-3 py-2 sticky left-0 bg-white dark:bg-gray-900 z-10 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400"
                    onClick={() => navigate(createPageUrl(`ClientDetail?id=${client.id}`))}
                  >
                    <div className="font-semibold text-gray-900 dark:text-white truncate max-w-[160px]">{client.name}</div>
                    <div className="text-[10px] text-gray-400">{client.package_type || "—"}</div>
                  </td>
                  <td className="px-2 py-2 text-gray-500 truncate max-w-[80px]">
                    {userMap[client.assigned_am]?.split(" ")[0] || "—"}
                  </td>
                  {days.map(d => {
                    const ci = checkInMap[`${client.id}_${d.date}`];
                    const isToday = d.date === today;
                    return (
                      <td key={d.date} className={`px-1.5 py-1.5 text-center ${isToday ? "bg-blue-50/50 dark:bg-blue-500/5" : ""}`}>
                        {ci ? (
                          <DayCell ci={ci} target={client.target_leads_per_week || 5} weekLeads={client.leads_this_week || 0} />
                        ) : (
                          <span className="text-gray-300 dark:text-gray-700">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-2 py-2 text-center bg-gray-50 dark:bg-gray-800/30">
                    <WeekTotalCell totals={totals} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          {/* Footer totals */}
          <tfoot>
            <tr className="bg-gray-100 dark:bg-gray-800 font-semibold">
              <td className="px-3 py-2.5 sticky left-0 bg-gray-100 dark:bg-gray-800 z-10 text-gray-700 dark:text-gray-300">
                Daily Totals
              </td>
              <td className="px-2 py-2.5 text-gray-500">{activeClients.length}</td>
              {dayTotals.map((t, i) => (
                <td key={i} className={`px-1.5 py-2 ${days[i].date === today ? "bg-blue-50 dark:bg-blue-500/10" : ""}`}>
                  <div className="text-left space-y-0.5 px-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">Leads</span>
                      <span className="text-[11px] font-bold text-gray-900 dark:text-white">{t.leads}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">Emails</span>
                      <span className="text-[11px] text-gray-600 dark:text-gray-300">{t.emails}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">InMails</span>
                      <span className="text-[11px] text-gray-600 dark:text-gray-300">{t.inmails}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-gray-400">Entries</span>
                      <span className="text-[11px] text-gray-500">{t.entries}/{activeClients.length}</span>
                    </div>
                  </div>
                </td>
              ))}
              <td className="px-2 py-2 bg-gray-100 dark:bg-gray-800">
                <div className="text-left space-y-0.5 px-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">Leads</span>
                    <span className="text-[11px] font-bold text-gray-900 dark:text-white">{dayTotals.reduce((s, t) => s + t.leads, 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">Emails</span>
                    <span className="text-[11px] text-gray-600 dark:text-gray-300">{dayTotals.reduce((s, t) => s + t.emails, 0)}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400">InMails</span>
                    <span className="text-[11px] text-gray-600 dark:text-gray-300">{dayTotals.reduce((s, t) => s + t.inmails, 0)}</span>
                  </div>
                </div>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function DayCell({ ci }) {
  const leads = ci.leads_generated || 0;
  const emails = ci.emails_sent || 0;
  const inmails = ci.inmails_sent || 0;
  const sat = ci.satisfaction_rate;
  const satColor = sat && sat >= 7 ? "text-green-600 dark:text-green-400" : sat && sat >= 4 ? "text-yellow-600 dark:text-yellow-400" : sat ? "text-red-600 dark:text-red-400" : "";

  return (
    <div className="text-left space-y-0.5 px-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">Leads</span>
        <span className={`text-[11px] font-bold ${leads > 0 ? "text-gray-900 dark:text-white" : "text-gray-400"}`}>{leads}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">Emails</span>
        <span className="text-[11px] text-gray-600 dark:text-gray-300">{emails}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">InMails</span>
        <span className="text-[11px] text-gray-600 dark:text-gray-300">{inmails}</span>
      </div>
      {sat != null && sat > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400">Sat.</span>
          <span className={`text-[11px] font-semibold ${satColor}`}>{sat}/10</span>
        </div>
      )}
    </div>
  );
}

function WeekTotalCell({ totals }) {
  return (
    <div className="text-left space-y-0.5 px-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">Leads</span>
        <span className="text-[11px] font-bold text-gray-900 dark:text-white">{totals.leads}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">Emails</span>
        <span className="text-[11px] text-gray-600 dark:text-gray-300">{totals.emails}</span>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-gray-400">InMails</span>
        <span className="text-[11px] text-gray-600 dark:text-gray-300">{totals.inmails}</span>
      </div>
      {totals.avgSat && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-gray-400">Avg Sat.</span>
          <span className={`text-[11px] font-semibold ${
            Number(totals.avgSat) >= 7 ? "text-green-600 dark:text-green-400" : Number(totals.avgSat) >= 4 ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"
          }`}>{totals.avgSat}/10</span>
        </div>
      )}
    </div>
  );
}
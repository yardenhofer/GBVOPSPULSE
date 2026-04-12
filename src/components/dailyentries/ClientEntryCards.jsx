import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { ExternalLink, Mail, Send, Target, Star, MessageSquare } from "lucide-react";

export default function ClientEntryCards({ rows, userMap, filter, isWeekend }) {
  const navigate = useNavigate();

  const filteredRows = rows.filter(r => {
    if (filter === "missing") return !isWeekend && !r.checkIn;
    if (filter === "below_kpi") {
      const target = r.client?.target_leads_per_week || 5;
      const leads = (r.client?.leads_this_week || 0) + (r.checkIn?.leads_generated || 0);
      return leads < target;
    }
    if (filter === "low_sat") return r.checkIn?.satisfaction_rate != null && r.checkIn.satisfaction_rate <= 4;
    return true;
  });

  if (filteredRows.length === 0) {
    return (
      <div className="text-center py-10 text-gray-500">
        <p className="text-sm">No entries match this filter.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
      {filteredRows.map(({ client, checkIn }) => {
        const target = client.target_leads_per_week || 5;
        const weekLeads = (client.leads_this_week || 0) + (checkIn?.leads_generated || 0);
        const belowKpi = weekLeads < target;
        const sat = checkIn?.satisfaction_rate;

        return (
          <div
            key={client.id}
            className={`rounded-xl border p-4 transition-all hover:shadow-md cursor-pointer ${
              !checkIn && !isWeekend
                ? "bg-red-500/5 border-red-200 dark:border-red-500/20"
                : belowKpi
                  ? "bg-orange-500/5 border-orange-200 dark:border-orange-500/20"
                  : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800"
            }`}
            onClick={() => navigate(createPageUrl(`ClientDetail?id=${client.id}`))}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{client.name}</p>
                <p className="text-[11px] text-gray-500">
                  {userMap[client.assigned_am] || client.assigned_am || "Unassigned"} · {client.package_type || "—"}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {!checkIn && isWeekend ? (
                  <span className="text-[10px] font-bold text-gray-400 bg-gray-500/10 px-2 py-0.5 rounded-full">WEEKEND</span>
                ) : !checkIn ? (
                  <span className="text-[10px] font-bold text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">NO ENTRY</span>
                ) : belowKpi ? (
                  <span className="text-[10px] font-bold text-orange-500 bg-orange-500/10 px-2 py-0.5 rounded-full">BELOW KPI</span>
                ) : (
                  <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full">ON TRACK</span>
                )}
              </div>
            </div>

            {checkIn ? (
              <>
                {/* Metrics */}
                <div className="grid grid-cols-4 gap-2 mb-3">
                  <MetricPill icon={Mail} label="Emails" value={checkIn.emails_sent || 0} />
                  <MetricPill icon={Send} label="InMails" value={checkIn.inmails_sent || 0} />
                  <MetricPill icon={Target} label="Leads" value={checkIn.leads_generated || 0} />
                  <MetricPill
                    icon={Star}
                    label="Sat."
                    value={sat != null ? `${sat}/10` : "—"}
                    color={sat && sat >= 7 ? "text-green-500" : sat && sat >= 4 ? "text-yellow-500" : sat ? "text-red-500" : "text-gray-400"}
                  />
                </div>

                {/* KPI bar */}
                <div className="mb-2">
                  <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
                    <span>Weekly leads: {weekLeads} / {target}</span>
                    <span className={belowKpi ? "text-orange-500 font-semibold" : "text-green-500 font-semibold"}>
                      {Math.round((weekLeads / target) * 100)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        weekLeads >= target ? "bg-green-500" : weekLeads >= target * 0.6 ? "bg-yellow-500" : "bg-red-500"
                      }`}
                      style={{ width: `${Math.min(100, Math.round((weekLeads / target) * 100))}%` }}
                    />
                  </div>
                </div>

                {/* Notes */}
                {checkIn.notes && (
                  <div className="mt-2 pt-2 border-t border-gray-100 dark:border-gray-800">
                    <div className="flex items-start gap-1.5">
                      <MessageSquare className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
                      <p className="text-[11px] text-gray-600 dark:text-gray-400 line-clamp-2">{checkIn.notes}</p>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="py-4 text-center">
                <p className="text-xs text-gray-400">No check-in submitted yet</p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MetricPill({ icon: Icon, label, value, color }) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center mb-0.5">
        <Icon className="w-3 h-3 text-gray-400" />
      </div>
      <p className={`text-sm font-bold ${color || "text-gray-900 dark:text-white"}`}>{value}</p>
      <p className="text-[9px] text-gray-500">{label}</p>
    </div>
  );
}
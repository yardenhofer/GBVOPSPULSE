import { differenceInDays, format } from "date-fns";
import { Zap, Pause, AlertTriangle } from "lucide-react";
import { STATUS_CONFIG, SENTIMENT_CONFIG, PACKAGE_CONFIG } from "../utils/redFlagEngine";

const STATUS_GLOW = {
  Healthy: "status-glow-healthy",
  Monitor: "status-glow-monitor",
  "At Risk": "status-glow-at-risk",
  Critical: "status-glow-critical",
};

export default function ClientRow({ client, flags, status, isOwn, onClick, instantlyResult }) {
  const seqPct = instantlyResult?.pct;
  const instantlyError = instantlyResult?.error;
  const noActive = instantlyResult?.noActive;
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["Healthy"];
  const sentCfg = SENTIMENT_CONFIG[client.client_sentiment] || SENTIMENT_CONFIG["Neutral"];
  const pkgCfg = PACKAGE_CONFIG[client.package_type] || {};

  const now = new Date();
  const touchpointDays = client.last_am_touchpoint
    ? differenceInDays(now, new Date(client.last_am_touchpoint))
    : null;

  const leadsChange = client.target_leads_per_week > 0
    ? Math.round(((client.leads_this_week || 0) - (client.leads_last_week || 0)) / (client.target_leads_per_week) * 100)
    : null;

  return (
    <div
      onClick={onClick}
      className={`relative bg-white dark:bg-gray-900 rounded-xl border cursor-pointer transition-all duration-150 hover:border-blue-400/50 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10
        ${isOwn ? "border-blue-400/40 dark:border-blue-500/30 ring-1 ring-blue-400/20" : "border-gray-200 dark:border-gray-800"}
      `}
    >
      {isOwn && (
        <div className="absolute top-2 right-2 text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded-full">
          Mine
        </div>
      )}

      <div className="p-4 grid grid-cols-[1fr_auto] gap-2 lg:grid-cols-[200px_90px_120px_80px_100px_90px_90px_90px_auto] lg:gap-4 items-center">
        {/* Name + AM */}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="font-semibold text-gray-900 dark:text-white text-sm truncate">{client.name}</p>
            {client.group != null && (
              <span className="shrink-0 text-[10px] font-bold text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded-full">G{client.group}</span>
            )}
            {client.instantly_api_key && (
              <span className="shrink-0 text-[10px] font-bold text-orange-400 bg-orange-500/10 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                <Zap className="w-2.5 h-2.5" />Instantly
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{client.assigned_am || "—"}</p>
        </div>

        {/* Package */}
        <span className={`hidden lg:inline-flex text-xs font-medium px-2 py-0.5 rounded-full ${pkgCfg.bg} ${pkgCfg.color}`}>
          {client.package_type || "—"}
        </span>

        {/* Status badge */}
        <span className={`hidden lg:inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border} ${STATUS_GLOW[status]}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
          {status}
        </span>

        {/* Sequence % */}
        <div className="hidden lg:block text-center">
          {client.instantly_api_key ? (
            instantlyError ? (
              <div className="flex flex-col items-center gap-0.5 flag-chip" data-tip={instantlyError}>
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span className="text-[10px] text-red-400">Error</span>
              </div>
            ) : noActive ? (
              <div className="flex flex-col items-center gap-0.5 flag-chip" data-tip="No active campaigns">
                <Pause className="w-4 h-4 text-yellow-400" />
                <span className="text-[10px] text-yellow-400">Paused</span>
              </div>
            ) : seqPct != null ? (
              <div className="flex flex-col items-center gap-0.5">
                <span className={`text-sm font-bold ${
                  seqPct >= 80 ? 'text-red-500' : seqPct >= 60 ? 'text-orange-500' : 'text-green-500'
                }`}>
                  {seqPct}%
                </span>
                <div className="w-12 h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      seqPct >= 80 ? 'bg-red-500' : seqPct >= 60 ? 'bg-orange-500' : 'bg-green-500'
                    }`}
                    style={{ width: `${Math.min(100, seqPct)}%` }}
                  />
                </div>
              </div>
            ) : (
              <span className="text-xs text-gray-400">…</span>
            )
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </div>

        {/* Leads this week */}
        <div className="hidden lg:block text-right">
          <p className="text-sm font-bold text-gray-900 dark:text-white">{client.leads_this_week ?? "—"}</p>
          <p className="text-xs text-gray-500">
            {leadsChange !== null ? (
              <span className={leadsChange < 0 ? "text-red-400" : leadsChange > 0 ? "text-green-400" : "text-gray-400"}>
                {leadsChange > 0 ? "+" : ""}{leadsChange}%
              </span>
            ) : "—"}
          </p>
        </div>

        {/* Sentiment */}
        <div className={`hidden lg:inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${sentCfg.bg} ${sentCfg.color}`}>
          {sentCfg.emoji} {client.client_sentiment?.split(" ").slice(-1)[0] || "—"}
        </div>

        {/* Last touchpoint */}
        <div className="hidden lg:block text-right">
          {touchpointDays !== null ? (
            <span className={`text-xs font-medium ${touchpointDays >= 5 ? "text-red-400" : touchpointDays >= 3 ? "text-yellow-400" : "text-gray-400"}`}>
              {touchpointDays}d ago
            </span>
          ) : <span className="text-xs text-gray-400">—</span>}
        </div>

        {/* Waiting */}
        <div className="hidden lg:block text-center">
          {client.waiting_on_leads ? (
            <span className="text-xs font-semibold text-orange-400">
              {client.waiting_since ? `${differenceInDays(new Date(), new Date(client.waiting_since))}d` : "Yes"}
            </span>
          ) : (
            <span className="text-xs text-gray-400">—</span>
          )}
        </div>

        {/* Flags */}
        <div className="flex items-center gap-1 flex-wrap justify-end">
          {flags.length === 0 && (
            <span className="text-xs text-gray-400 hidden lg:block">No flags</span>
          )}
          {flags.map((f, i) => (
            <span
              key={i}
              className={`flag-chip text-sm ${f.severity === 'red' ? 'opacity-100' : 'opacity-70'}`}
              data-tip={f.message}
            >
              {f.emoji}
            </span>
          ))}
          {/* Mobile status */}
          <span className={`lg:hidden text-xs font-semibold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
            {status}
          </span>
        </div>
      </div>
    </div>
  );
}
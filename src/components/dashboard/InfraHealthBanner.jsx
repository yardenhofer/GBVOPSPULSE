import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, Flame, ChevronDown, ChevronUp, X, TrendingUp } from "lucide-react";

const THRESHOLD_PCT = 5;
const DISMISSED_KEY = "infra_health_dismissed";

function getDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
}

// Detect if errors are growing over recent snapshots (at least 2 days of data)
function detectBurning(snapshots) {
  if (!snapshots || snapshots.length < 2) return false;
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  // Check if the last 2+ days show a strictly increasing error count
  let increasing = 0;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].error_accounts > sorted[i - 1].error_accounts) increasing++;
  }
  // Burning if errors grew on at least 2 consecutive days
  return increasing >= 2;
}

function trendLabel(snapshots) {
  if (!snapshots || snapshots.length < 2) return null;
  const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
  const oldest = sorted[0];
  const newest = sorted[sorted.length - 1];
  const diff = newest.error_accounts - oldest.error_accounts;
  if (diff > 0) return `+${diff} in ${sorted.length}d`;
  if (diff < 0) return `${diff} in ${sorted.length}d`;
  return null;
}

export default function InfraHealthBanner() {
  const [alerts, setAlerts] = useState([]);
  const [trends, setTrends] = useState({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(getDismissed);

  useEffect(() => {
    // Fetch current health + historical trends in parallel
    Promise.all([
      base44.functions.invoke("instantlyInboxHealth", {}),
      base44.functions.invoke("infraHealthSnapshot", { action: "trend" }).catch(() => ({ data: {} })),
    ]).then(([healthRes, trendRes]) => {
      const results = healthRes.data?.results || [];
      setAlerts(results.filter(r => r.error_pct >= THRESHOLD_PCT));
      setTrends(trendRes.data?.byClient || {});
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  function dismiss(clientId) {
    const next = [...dismissed, clientId];
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    setDismissed(next);
  }

  function dismissAll() {
    const next = [...dismissed, ...visible.map(a => a.client_id)];
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
    setDismissed(next);
  }

  const visible = alerts.filter(a => !dismissed.includes(a.client_id));
  const burningClients = visible.filter(a => detectBurning(trends[a.client_id]));
  const hasBurning = burningClients.length > 0;

  if (loading || visible.length === 0) return null;

  return (
    <div className="space-y-2">
      {/* Critical burning banner */}
      {hasBurning && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-300 dark:border-red-800/50 rounded-xl p-3">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-red-500 shrink-0" />
            <span className="text-sm font-bold text-red-700 dark:text-red-300">
              🔥 Active Burn Detected — {burningClients.length} client{burningClients.length !== 1 ? "s" : ""} with growing disconnections
            </span>
          </div>
          <div className="mt-1.5 space-y-1">
            {burningClients.map(a => {
              const trend = trendLabel(trends[a.client_id]);
              return (
                <div key={a.client_id} className="flex items-center gap-3 text-xs py-1 px-2 rounded bg-red-100 dark:bg-red-900/30">
                  <TrendingUp className="w-3 h-3 text-red-500 shrink-0" />
                  <span className="font-semibold text-red-800 dark:text-red-200">{a.client_name}</span>
                  <span className="text-red-600 dark:text-red-400">
                    {a.errors}/{a.total} errored ({a.error_pct}%)
                  </span>
                  {trend && (
                    <span className="text-red-500 font-semibold">{trend}</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Standard warning banner */}
      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-xl p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
            <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              {visible.length} Client{visible.length !== 1 ? "s" : ""} with ≥{THRESHOLD_PCT}% Inboxes Disconnected
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-amber-600 dark:text-amber-400 hover:underline flex items-center gap-0.5"
            >
              {expanded ? "Hide" : "Details"}
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
            <button
              onClick={dismissAll}
              className="ml-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              title="Dismiss all"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {expanded && (
          <div className="mt-2 space-y-1">
            {visible
              .sort((a, b) => b.error_pct - a.error_pct)
              .map(a => {
                const isBurning = detectBurning(trends[a.client_id]);
                const trend = trendLabel(trends[a.client_id]);
                return (
                  <div key={a.client_id} className={`flex items-center justify-between text-xs py-1.5 px-2 rounded ${
                    isBurning ? "bg-red-100 dark:bg-red-900/30" : "bg-amber-100 dark:bg-amber-900/30"
                  }`}>
                    <div className="flex items-center gap-3 min-w-0">
                      {isBurning && <Flame className="w-3 h-3 text-red-500 shrink-0" />}
                      <span className={`font-semibold truncate ${isBurning ? "text-red-800 dark:text-red-200" : "text-amber-800 dark:text-amber-200"}`}>
                        {a.client_name}
                      </span>
                      <span className={`shrink-0 ${isBurning ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400"}`}>
                        {a.errors}/{a.total} errored ({a.error_pct}%)
                      </span>
                      {trend && (
                        <span className={`font-semibold shrink-0 ${isBurning ? "text-red-500" : "text-gray-500"}`}>
                          {trend}
                        </span>
                      )}
                      {a.assigned_am && (
                        <span className="text-gray-500 dark:text-gray-400 truncate hidden sm:inline">
                          AM: {a.assigned_am.split("@")[0]}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => dismiss(a.client_id)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5 shrink-0"
                      title="Dismiss"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
}
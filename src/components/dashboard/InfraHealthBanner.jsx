import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, ChevronDown, ChevronUp, X } from "lucide-react";

const THRESHOLD_PCT = 10;
const DISMISSED_KEY = "infra_health_dismissed";

function getDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
}

export default function InfraHealthBanner() {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [dismissed, setDismissed] = useState(getDismissed);

  useEffect(() => {
    base44.functions.invoke("instantlyInboxHealth", {})
      .then(res => {
        const results = res.data?.results || [];
        setAlerts(results.filter(r => r.error_pct >= THRESHOLD_PCT));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
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

  if (loading || visible.length === 0) return null;

  return (
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
            .map(a => (
            <div key={a.client_id} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-amber-100 dark:bg-amber-900/30">
              <div className="flex items-center gap-3 min-w-0">
                <span className="font-semibold text-amber-800 dark:text-amber-200 truncate">{a.client_name}</span>
                <span className="text-amber-600 dark:text-amber-400 shrink-0">
                  {a.errors}/{a.total} errored ({a.error_pct}%)
                </span>
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
          ))}
        </div>
      )}
    </div>
  );
}
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { AlertTriangle, X, ChevronDown, ChevronUp } from "lucide-react";

const DISMISSED_KEY = "heyreach_dismissed_disconnected";

function getDismissed() {
  try { return JSON.parse(localStorage.getItem(DISMISSED_KEY) || "[]"); } catch { return []; }
}

function setDismissed(ids) {
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(ids));
}

export default function DisconnectedAccountsBanner() {
  const [accounts, setAccounts] = useState([]);
  const [dismissed, setDismissedState] = useState(getDismissed);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    base44.functions.invoke("heyReachDisconnected", {})
      .then(res => {
        setAccounts(res.data?.disconnected || []);
        // Auto-remove dismissed IDs that are no longer disconnected
        const currentIds = new Set((res.data?.disconnected || []).map(a => a.id));
        const cleaned = getDismissed().filter(id => currentIds.has(id));
        if (cleaned.length !== getDismissed().length) {
          setDismissed(cleaned);
          setDismissedState(cleaned);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const visible = accounts.filter(a => !dismissed.includes(a.id));

  if (loading || visible.length === 0) return null;

  function dismissOne(id) {
    const next = [...dismissed, id];
    setDismissed(next);
    setDismissedState(next);
  }

  function dismissAll() {
    const next = [...dismissed, ...visible.map(a => a.id)];
    setDismissed(next);
    setDismissedState(next);
  }

  const withCampaigns = visible.filter(a => a.activeCampaigns > 0);
  const inactive = visible.filter(a => a.activeCampaigns === 0);

  return (
    <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <span className="text-sm font-semibold text-red-700 dark:text-red-300">
            {visible.length} Disconnected Account{visible.length !== 1 ? "s" : ""}
          </span>
          {withCampaigns.length > 0 && (
            <span className="text-xs text-red-500 dark:text-red-400">
              ({withCampaigns.length} with active campaigns)
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setExpanded(e => !e)}
            className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-0.5"
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
          {withCampaigns.length > 0 && (
            <p className="text-[10px] uppercase tracking-wider text-red-500 font-semibold mt-1">With Active Campaigns</p>
          )}
          {withCampaigns.map(a => (
            <div key={a.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-red-100 dark:bg-red-900/30">
              <div>
                <span className="font-medium text-red-800 dark:text-red-200">{a.name}</span>
                <span className="text-red-500 dark:text-red-400 ml-2">{a.email}</span>
                <span className="text-red-400 ml-2">· {a.activeCampaigns} campaign{a.activeCampaigns !== 1 ? "s" : ""}</span>
              </div>
              <button onClick={() => dismissOne(a.id)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5" title="Don't show again">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}

          {inactive.length > 0 && (
            <p className="text-[10px] uppercase tracking-wider text-gray-500 font-semibold mt-2">Inactive</p>
          )}
          {inactive.map(a => (
            <div key={a.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-gray-100 dark:bg-gray-800/50">
              <div>
                <span className="font-medium text-gray-700 dark:text-gray-300">{a.name}</span>
                <span className="text-gray-500 ml-2">{a.email}</span>
              </div>
              <button onClick={() => dismissOne(a.id)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5" title="Don't show again">
                <X className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, CheckCircle2, XCircle, AlertTriangle, Globe, Send } from "lucide-react";

export default function PorkbunNameserverPanel({ tenant }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyResult, setApplyResult] = useState(null);

  async function fetchStatus() {
    setLoading(true);
    setApplyResult(null);
    const res = await base44.functions.invoke("porkbunNameservers", { action: "getStatus", tenantId: tenant.id });
    setData(res.data);
    setLoading(false);
  }

  async function applyNow() {
    setApplying(true);
    setApplyResult(null);
    const res = await base44.functions.invoke("porkbunNameservers", { action: "applyNs", tenantId: tenant.id });
    setApplyResult(res.data);
    setApplying(false);
    // Refresh status after apply
    await fetchStatus();
  }

  if (!tenant.scalesends_job_id || !tenant.sending_domain) {
    return null;
  }

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 pt-3 mt-3">
      <div className="flex items-center justify-between mb-2">
        <h5 className="text-xs font-semibold text-gray-500 flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5" /> Porkbun Nameservers
        </h5>
        <button onClick={fetchStatus} disabled={loading}
          className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 disabled:text-gray-400">
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> {data ? "Refresh" : "Check Status"}
        </button>
      </div>

      {/* Quick status from tenant record */}
      <div className="flex flex-wrap gap-3 text-xs mb-2">
        <StatusIndicator
          label="Applied"
          value={tenant.porkbun_ns_applied_at}
          good={!!tenant.porkbun_ns_applied_at}
          display={tenant.porkbun_ns_applied_at ? new Date(tenant.porkbun_ns_applied_at).toLocaleString() : "Not yet"}
        />
        {tenant.porkbun_last_error && (
          <div className="flex items-center gap-1 text-red-500">
            <XCircle className="w-3 h-3" />
            <span className="max-w-[250px] truncate" title={tenant.porkbun_last_error}>{tenant.porkbun_last_error}</span>
          </div>
        )}
      </div>

      {/* Detailed status (after clicking Check Status) */}
      {data && (
        <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg p-3 space-y-2 text-xs">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="text-gray-500 block">Domain</span>
              <span className="font-mono text-gray-900 dark:text-white">{data.domain}</span>
            </div>
            <div>
              <span className="text-gray-500 block">Scalesends NS Status</span>
              <NsStatusBadge status={data.scalesendsNameserversStatus} />
            </div>
          </div>

          {/* Required NS */}
          {data.requiredNameservers?.length > 0 && (
            <div>
              <span className="text-gray-500 block mb-0.5">Required (from Scalesends)</span>
              <div className="flex flex-wrap gap-1">
                {data.requiredNameservers.map(ns => (
                  <span key={ns} className="font-mono bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400 px-1.5 py-0.5 rounded">{ns}</span>
                ))}
              </div>
            </div>
          )}

          {/* Current NS at Porkbun */}
          <div>
            <span className="text-gray-500 block mb-0.5">Current (at Porkbun)</span>
            {data.porkbunError ? (
              <span className="text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> {data.porkbunError}</span>
            ) : data.currentPorkbunNameservers?.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {data.currentPorkbunNameservers.map(ns => (
                  <span key={ns} className="font-mono bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-1.5 py-0.5 rounded">{ns}</span>
                ))}
              </div>
            ) : (
              <span className="text-gray-400">None</span>
            )}
          </div>

          {/* Match indicator */}
          <div className="flex items-center gap-1.5">
            {data.matched ? (
              <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3.5 h-3.5" /> Nameservers match</span>
            ) : data.requiredNameservers?.length > 0 ? (
              <span className="flex items-center gap-1 text-red-500"><XCircle className="w-3.5 h-3.5" /> Nameservers do NOT match</span>
            ) : (
              <span className="text-gray-400">No required nameservers yet</span>
            )}
          </div>

          {/* Apply button */}
          {!data.matched && data.requiredNameservers?.length > 0 && !data.porkbunError && (
            <button onClick={applyNow} disabled={applying}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium mt-1">
              {applying ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Apply Nameservers Now
            </button>
          )}

          {/* Apply result */}
          {applyResult && (
            <div className={`mt-1 p-2 rounded text-xs ${applyResult.success || applyResult.alreadyMatched ? "bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-400" : "bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400"}`}>
              {applyResult.success ? "Nameservers applied successfully!" : applyResult.alreadyMatched ? "Nameservers already match — no update needed." : applyResult.reason || "Update failed."}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function StatusIndicator({ label, good, display }) {
  return (
    <div className="flex items-center gap-1">
      {good ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-gray-300" />}
      <span className="text-gray-500">{label}:</span>
      <span className={good ? "text-green-600 dark:text-green-400" : "text-gray-400"}>{display}</span>
    </div>
  );
}

function NsStatusBadge({ status }) {
  const colors = {
    foundInDns: "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400",
    completed: "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400",
    notFoundInDns: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
    initial: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400",
    inprogress: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  };
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colors[status] || "bg-gray-100 text-gray-600"}`}>
      {status || "unknown"}
    </span>
  );
}
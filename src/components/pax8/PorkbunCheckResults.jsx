import { CheckCircle, XCircle, AlertTriangle, Globe, RefreshCw } from "lucide-react";

export default function PorkbunCheckResults({ data, loading, onRun }) {
  if (!data && !loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Porkbun Domain Check</h3>
          </div>
          <button onClick={onRun} disabled={loading} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium disabled:opacity-50">
            <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            Check API Access
          </button>
        </div>
        <p className="text-xs text-gray-400 mt-2">Verifies that each eligible domain has Porkbun API access enabled before purchasing licenses.</p>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-indigo-500" />
          <span className="text-sm text-gray-500">Checking Porkbun API access for domains…</span>
        </div>
      </div>
    );
  }

  const { results, okCount, apiDisabledCount, notFoundCount, otherErrorCount, total } = data;
  const allGood = okCount === total;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-indigo-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Porkbun Domain Check</h3>
        </div>
        <button onClick={onRun} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium">
          <RefreshCw className="w-3 h-3" /> Re-check
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-green-500/10 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-500">{okCount}</p>
          <p className="text-xs text-green-400">API OK</p>
        </div>
        <div className={`rounded-lg p-3 text-center ${apiDisabledCount > 0 ? "bg-red-500/10" : "bg-gray-100 dark:bg-gray-800"}`}>
          <p className={`text-2xl font-bold ${apiDisabledCount > 0 ? "text-red-500" : "text-gray-400"}`}>{apiDisabledCount}</p>
          <p className={`text-xs ${apiDisabledCount > 0 ? "text-red-400" : "text-gray-400"}`}>API Disabled</p>
        </div>
        <div className={`rounded-lg p-3 text-center ${notFoundCount > 0 ? "bg-amber-500/10" : "bg-gray-100 dark:bg-gray-800"}`}>
          <p className={`text-2xl font-bold ${notFoundCount > 0 ? "text-amber-500" : "text-gray-400"}`}>{notFoundCount}</p>
          <p className={`text-xs ${notFoundCount > 0 ? "text-amber-400" : "text-gray-400"}`}>Not Found</p>
        </div>
        <div className={`rounded-lg p-3 text-center ${otherErrorCount > 0 ? "bg-orange-500/10" : "bg-gray-100 dark:bg-gray-800"}`}>
          <p className={`text-2xl font-bold ${otherErrorCount > 0 ? "text-orange-500" : "text-gray-400"}`}>{otherErrorCount}</p>
          <p className={`text-xs ${otherErrorCount > 0 ? "text-orange-400" : "text-gray-400"}`}>Other Errors</p>
        </div>
      </div>

      {allGood && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-3 flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          <p className="text-sm text-green-600 dark:text-green-400 font-medium">All {total} domains have Porkbun API access enabled. Safe to proceed.</p>
        </div>
      )}

      {!allGood && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
          <p className="text-sm text-red-500 font-medium">
            {apiDisabledCount > 0 && `${apiDisabledCount} domain(s) need API access enabled in Porkbun. `}
            {notFoundCount > 0 && `${notFoundCount} domain(s) not found in Porkbun. `}
            Fix these before purchasing licenses.
          </p>
        </div>
      )}

      {/* Failed domains list */}
      {results.filter(r => !r.ok).length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Issues ({results.filter(r => !r.ok).length})</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {results.filter(r => !r.ok).map((r, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-red-500/5 border border-red-500/20">
                <span className="text-red-600 dark:text-red-400 font-mono">{r.domain}</span>
                <span className="text-red-400 truncate max-w-[200px]" title={r.error}>
                  {r.apiDisabled ? "API access disabled" : r.notFound ? "Domain not found" : r.error}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
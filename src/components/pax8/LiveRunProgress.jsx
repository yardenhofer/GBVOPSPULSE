import { CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";

export default function LiveRunProgress({ results, currentClient, totalClients, halted, cumulativeCost, spendCap, onHalt }) {
  const successCount = results.filter(r => r.status === "success").length;
  const failCount = results.filter(r => r.status === "failed").length;
  const isRunning = !!currentClient;
  const progress = totalClients > 0 ? Math.round((results.length / totalClients) * 100) : 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
          {isRunning ? "Live Run in Progress…" : halted ? "Run Halted" : "Run Complete"}
        </h3>
        {isRunning && (
          <button
            onClick={onHalt}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-medium"
          >
            <AlertTriangle className="w-3 h-3" />
            Emergency Halt
          </button>
        )}
      </div>

      {/* Progress bar */}
      <div>
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{results.length} / {totalClients} processed</span>
          <span>{progress}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div
            className="h-full rounded-full bg-blue-600 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      {/* Spend tracker */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-gray-500">Spend: <strong className="text-gray-900 dark:text-white">${cumulativeCost}</strong> / ${spendCap} cap</span>
        <span className="text-green-500">✅ {successCount}</span>
        <span className="text-red-500">❌ {failCount}</span>
      </div>

      {/* Current client */}
      {currentClient && (
        <div className="flex items-center gap-2 text-xs text-blue-500">
          <Loader2 className="w-3 h-3 animate-spin" />
          Processing: {currentClient}
        </div>
      )}

      {halted && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400">
          Run was halted. {results.length} of {totalClients} clients were processed before halt.
        </div>
      )}

      {/* Results list */}
      <div className="space-y-1 max-h-64 overflow-y-auto">
        {results.map((r, i) => (
          <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-gray-50 dark:bg-gray-800">
            <span className="text-gray-700 dark:text-gray-300">{r.companyName}</span>
            <span className={`flex items-center gap-1 ${r.status === "success" ? "text-green-500" : "text-red-500"}`}>
              {r.status === "success" ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
              {r.status === "success" ? "Ordered" : r.error || "Failed"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
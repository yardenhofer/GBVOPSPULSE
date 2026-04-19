import { CheckCircle, XCircle, AlertTriangle, RotateCcw } from "lucide-react";

export default function MockResultsSummary({ mockResults, onRerunMock }) {
  if (!mockResults || mockResults.length === 0) return null;

  const successCount = mockResults.filter(r => r.status === "mock_success").length;
  const failCount = mockResults.filter(r => r.status !== "mock_success").length;
  const allPassed = failCount === 0;

  return (
    <div className={`rounded-xl border p-5 space-y-4 ${
      allPassed 
        ? "bg-green-500/5 border-green-500/20" 
        : "bg-amber-500/5 border-amber-500/20"
    }`}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          {allPassed 
            ? <CheckCircle className="w-5 h-5 text-green-500" />
            : <AlertTriangle className="w-5 h-5 text-amber-500" />
          }
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">
              Mock Run {allPassed ? "Passed" : "Completed with Failures"}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {successCount} passed · {failCount} failed · {mockResults.length} total
            </p>
          </div>
        </div>
        <button
          onClick={onRerunMock}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium transition-colors"
        >
          <RotateCcw className="w-3 h-3" />
          Re-run Mock
        </button>
      </div>

      {/* Results list */}
      <div className="space-y-1 max-h-48 overflow-y-auto">
        {mockResults.map((r, i) => {
          const ok = r.status === "mock_success";
          return (
            <div key={i} className={`flex items-center justify-between text-xs py-1.5 px-3 rounded border ${
              ok ? "bg-green-500/10 border-green-500/20" : "bg-red-500/10 border-red-500/20"
            }`}>
              <div className="flex items-center gap-2">
                {ok 
                  ? <CheckCircle className="w-3.5 h-3.5 text-green-500 shrink-0" /> 
                  : <XCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                }
                <span className={ok ? "text-green-700 dark:text-green-400 font-medium" : "text-red-700 dark:text-red-400 font-medium"}>
                  {r.companyName}
                </span>
              </div>
              <span className={`${ok ? "text-green-500" : "text-red-500"} shrink-0`}>
                {ok ? `✓ ${r.domainUsed || "OK"}` : (r.error || "Failed")}
              </span>
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      <div className="flex gap-2">
        <div className="flex-1 h-2 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
          <div 
            className="h-full bg-green-500 rounded-full transition-all" 
            style={{ width: `${(successCount / mockResults.length) * 100}%` }} 
          />
        </div>
      </div>
    </div>
  );
}
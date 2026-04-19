import { CheckCircle, XCircle } from "lucide-react";

export default function PreflightResults({ data, mockResults }) {
  if (!data) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
      <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Pre-Flight Results</h3>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-green-500/10 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-green-500">{data.eligible?.length || 0}</p>
          <p className="text-xs text-green-400">Eligible</p>
        </div>
        <div className="bg-yellow-500/10 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-yellow-500">{data.skipped?.length || 0}</p>
          <p className="text-xs text-yellow-400">Skipped</p>
        </div>
        <div className="bg-blue-500/10 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-blue-500">{data.totalCompanies || 0}</p>
          <p className="text-xs text-blue-400">Total Scanned</p>
        </div>
        <div className="bg-purple-500/10 rounded-lg p-3 text-center">
          <p className="text-2xl font-bold text-purple-500">{data.alreadyHave || 0}</p>
          <p className="text-xs text-purple-400">Already Have</p>
        </div>
      </div>

      {/* Eligible list */}
      {data.eligible?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Eligible Clients ({data.eligible.length})</p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {data.eligible.map((c, i) => {
              const mock = mockResults?.find(m => m.companyId === c.companyId);
              const isSuccess = mock?.status === "mock_success";
              const isFail = mock && !isSuccess;
              return (
                <div key={i} className={`flex items-center justify-between text-xs py-1.5 px-2 rounded border ${
                  isSuccess ? "bg-green-500/10 border-green-500/30" :
                  isFail ? "bg-red-500/10 border-red-500/30" :
                  "bg-gray-50 dark:bg-gray-800 border-transparent"
                }`}>
                  <span className={isSuccess ? "text-green-600 dark:text-green-400 font-medium" : isFail ? "text-red-600 dark:text-red-400" : "text-gray-700 dark:text-gray-300"}>
                    {c.companyName}
                  </span>
                  {mock && (
                    <span className={`flex items-center gap-1 ${isSuccess ? "text-green-500" : "text-red-500"}`}>
                      {isSuccess ? <CheckCircle className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {isSuccess ? "Mock OK" : mock.error || "Mock Fail"}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Skipped list */}
      {data.skipped?.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Skipped ({data.skipped.length})</p>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {data.skipped.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-gray-50 dark:bg-gray-800">
                <span className="text-gray-700 dark:text-gray-300">{s.companyName}</span>
                <span className="text-yellow-500">{s.reason}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
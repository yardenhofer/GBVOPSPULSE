import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { History, CheckCircle2, XCircle, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

export default function CsvImportHistory() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    base44.entities.CsvImportLog.list("-created_date", 20)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-xs text-gray-400 py-4 text-center">Loading import history…</div>;
  if (logs.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
      <div className="flex items-center gap-2">
        <History className="w-4 h-4 text-gray-400" />
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Import History</h3>
        <span className="text-xs text-gray-400">({logs.length})</span>
      </div>

      <div className="space-y-1">
        {logs.map(log => {
          const isExpanded = expandedId === log.id;
          const errors = log.errors ? JSON.parse(log.errors) : [];
          return (
            <div key={log.id} className="border border-gray-100 dark:border-gray-800 rounded-lg">
              <button
                onClick={() => setExpandedId(isExpanded ? null : log.id)}
                className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors rounded-lg"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{log.file_name}</span>
                  <span className="text-[10px] text-gray-400 shrink-0">
                    {format(new Date(log.created_date), "MMM d, yyyy h:mm a")}
                  </span>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="flex items-center gap-1 text-xs text-green-600">
                    <CheckCircle2 className="w-3 h-3" /> {log.success_count || 0}
                  </span>
                  {(log.fail_count || 0) > 0 && (
                    <span className="flex items-center gap-1 text-xs text-red-500">
                      <XCircle className="w-3 h-3" /> {log.fail_count}
                    </span>
                  )}
                  <span className="text-[10px] text-gray-400">{log.row_count} rows</span>
                  {isExpanded ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronDown className="w-3 h-3 text-gray-400" />}
                </div>
              </button>

              {isExpanded && (
                <div className="px-3 pb-3 space-y-2">
                  {log.imported_by && (
                    <p className="text-[10px] text-gray-400">Imported by: {log.imported_by}</p>
                  )}
                  {log.company_names && (
                    <div>
                      <p className="text-[10px] text-gray-500 font-medium mb-1">Companies:</p>
                      <p className="text-xs text-gray-600 dark:text-gray-400 leading-relaxed">{log.company_names}</p>
                    </div>
                  )}
                  {errors.length > 0 && (
                    <div>
                      <p className="text-[10px] text-red-400 font-medium mb-1">Errors:</p>
                      <div className="space-y-0.5">
                        {errors.map((err, i) => (
                          <p key={i} className="text-[10px] text-red-400">Row {err.row}: {err.name} — {err.error}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
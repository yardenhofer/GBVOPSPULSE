import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { History, CheckCircle2, XCircle, ChevronDown, ChevronUp, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

export default function CsvImportHistory() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [deleteProgress, setDeleteProgress] = useState(null);
  const [deleteResults, setDeleteResults] = useState({});
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  useEffect(() => {
    base44.entities.CsvImportLog.list("-created_date", 20)
      .then(setLogs)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDeleteCompanies(log) {
    if (!log.company_names) return;
    setDeletingId(log.id);
    setDeleteProgress({ phase: "Looking up companies…", current: 0, total: 0 });

    const names = log.company_names.split(",").map(n => n.trim()).filter(Boolean);

    // Step 1: Find company IDs by name
    const lookupRes = await base44.functions.invoke("pax8Auth", {
      action: "findCompaniesByName",
      names,
    });
    const found = (lookupRes.data.results || []).filter(r => r.found);

    if (found.length === 0) {
      setDeleteResults(prev => ({ ...prev, [log.id]: { deleted: 0, notFound: names.length, failed: 0, details: [] } }));
      setDeletingId(null);
      setDeleteProgress(null);
      setConfirmDeleteId(null);
      return;
    }

    // Step 2: Delete in batches of 10
    setDeleteProgress({ phase: "Deleting…", current: 0, total: found.length });
    const BATCH = 10;
    let deleted = 0, failed = 0;
    const details = [];

    for (let i = 0; i < found.length; i += BATCH) {
      const batch = found.slice(i, i + BATCH).map(r => ({ companyId: r.companyId, companyName: r.companyName }));
      const res = await base44.functions.invoke("pax8Auth", {
        action: "deleteCompanies",
        companies: batch,
      });
      for (const r of (res.data.results || [])) {
        if (r.status === "deleted") deleted++;
        else { failed++; details.push(`${r.companyName}: ${r.error}`); }
      }
      setDeleteProgress({ phase: "Deleting…", current: Math.min(i + BATCH, found.length), total: found.length });
    }

    const notFound = names.length - found.length;
    setDeleteResults(prev => ({ ...prev, [log.id]: { deleted, notFound, failed, details } }));
    setDeletingId(null);
    setDeleteProgress(null);
    setConfirmDeleteId(null);
  }

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

                  {/* Delete results */}
                  {deleteResults[log.id] && (
                    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-2 text-xs space-y-0.5">
                      <p className="font-medium text-gray-700 dark:text-gray-300">
                        Delete results: {deleteResults[log.id].deleted} deleted
                        {deleteResults[log.id].notFound > 0 && <span className="text-amber-500"> · {deleteResults[log.id].notFound} not found on Pax8</span>}
                        {deleteResults[log.id].failed > 0 && <span className="text-red-500"> · {deleteResults[log.id].failed} failed</span>}
                      </p>
                      {deleteResults[log.id].details.length > 0 && (
                        <div className="text-[10px] text-red-400">
                          {deleteResults[log.id].details.map((d, i) => <p key={i}>{d}</p>)}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Delete button / confirm / progress */}
                  {log.company_names && !deleteResults[log.id] && (
                    <div className="pt-1">
                      {deletingId === log.id && deleteProgress ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {deleteProgress.phase} {deleteProgress.total > 0 && `${deleteProgress.current}/${deleteProgress.total}`}
                        </div>
                      ) : confirmDeleteId === log.id ? (
                        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                          <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                          <span className="text-xs text-red-500 font-medium">Delete these {log.company_names.split(",").length} companies from Pax8?</span>
                          <button
                            onClick={() => handleDeleteCompanies(log)}
                            className="ml-auto px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-md transition-colors"
                          >
                            Yes, Delete
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2.5 py-1 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-md transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(log.id)}
                          disabled={!!deletingId}
                          className="flex items-center gap-1.5 text-xs text-red-500 hover:text-red-600 font-medium disabled:opacity-40 transition-colors"
                        >
                          <Trash2 className="w-3 h-3" />
                          Delete Pax8 Companies
                        </button>
                      )}
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
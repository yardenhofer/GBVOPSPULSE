import { AlertTriangle, RefreshCw } from "lucide-react";

export default function ScalesendsConfirmDialog({ count, tenantDomain, onConfirm, onCancel, submitting }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 max-w-sm w-full mx-4 shadow-xl">
        <div className="flex items-center gap-2 mb-3">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Confirm Submission</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
          {count === 1
            ? `Send ${tenantDomain || "this tenant"} to Scalesends?`
            : `Send ${count} tenants to Scalesends?`
          }
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400 mb-4">
          This will consume Scalesends job credits. Continue?
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} disabled={submitting}
            className="text-sm px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={submitting}
            className="text-sm px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5">
            {submitting ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : null}
            {submitting ? "Submitting…" : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
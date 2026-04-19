import { useState } from "react";
import { FileCheck } from "lucide-react";

export default function ScalesendsMarkManualDialog({ count, onConfirm, onCancel }) {
  const [notes, setNotes] = useState("");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 max-w-sm w-full mx-4 shadow-xl">
        <div className="flex items-center gap-2 mb-3">
          <FileCheck className="w-5 h-5 text-purple-500" />
          <h3 className="font-semibold text-gray-900 dark:text-white">Mark as Manually Uploaded</h3>
        </div>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
          Mark {count} tenant{count !== 1 ? "s" : ""} as manually uploaded to Scalesends.
        </p>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Optional notes (e.g. uploaded via web UI on 4/19)…"
          rows={3}
          className="w-full text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white p-2 outline-none focus:ring-2 focus:ring-purple-500 mb-4"
        />
        <div className="flex justify-end gap-2">
          <button onClick={onCancel}
            className="text-sm px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800">
            Cancel
          </button>
          <button onClick={() => onConfirm(notes)}
            className="text-sm px-4 py-2 rounded-lg bg-purple-600 text-white hover:bg-purple-700">
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
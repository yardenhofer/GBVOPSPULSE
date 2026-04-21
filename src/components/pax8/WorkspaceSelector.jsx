import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ChevronDown } from "lucide-react";

export default function WorkspaceSelector({ value, onChange }) {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    base44.entities.InstantlyWorkspace.list("-created_date", 100).then(list => {
      setWorkspaces(list);
      // Auto-select default if no value yet
      if (!value) {
        const def = list.find(w => w.is_default);
        if (def) onChange(def.id);
      }
      setLoading(false);
    });
  }, []);

  const selected = workspaces.find(w => w.id === value);

  if (loading) return <div className="text-xs text-gray-400">Loading workspaces…</div>;

  if (workspaces.length === 0) {
    return (
      <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/5 px-3 py-2 rounded-lg">
        No Instantly workspaces configured. Add one in Settings first.
      </div>
    );
  }

  return (
    <div className="relative">
      <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Deliver inboxes to workspace</label>
      <button type="button" onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white hover:border-gray-300 dark:hover:border-gray-600">
        <span>{selected ? selected.name : "Select workspace…"}</span>
        <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute z-50 mt-1 w-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
            <button onClick={() => { onChange(null); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700">
              None (skip upload)
            </button>
            {workspaces.map(ws => (
              <button key={ws.id} onClick={() => { onChange(ws.id); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 flex items-center justify-between ${
                  value === ws.id ? "bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-400" : "text-gray-900 dark:text-white"
                }`}>
                <span>{ws.name}</span>
                {ws.is_default && <span className="text-[10px] text-amber-500 font-medium">Default</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
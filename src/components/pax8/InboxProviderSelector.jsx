import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";

export default function InboxProviderSelector({ value, onChange }) {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.InboxProvider.list("-created_date", 50).then(list => {
      setProviders(list);
      // Auto-select default if none selected
      if (!value) {
        const def = list.find(p => p.is_default);
        if (def) onChange(def.id);
      }
      setLoading(false);
    });
  }, []);

  if (loading) return <p className="text-xs text-gray-400">Loading providers…</p>;
  if (providers.length === 0) return <p className="text-xs text-amber-500">No inbox providers configured. Go to Settings to add one.</p>;

  return (
    <div>
      <label className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1 block">Inbox Provider (Scalesends)</label>
      <select
        value={value || ""}
        onChange={e => onChange(e.target.value || null)}
        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      >
        <option value="">None (skip inboxProvider)</option>
        {providers.map(p => (
          <option key={p.id} value={p.id}>
            {p.display_name} → {p.provider_name} {p.is_default ? "(default)" : ""}
          </option>
        ))}
      </select>
    </div>
  );
}
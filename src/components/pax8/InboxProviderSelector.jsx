import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw } from "lucide-react";

export default function InboxProviderSelector({ value, onChange }) {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  async function loadProviders() {
    setLoading(true);
    setError(null);
    const res = await base44.functions.invoke("scalesendsSubmit", { action: "listInboxProviders" });
    if (res.data.error) {
      setError(res.data.error);
      setProviders([]);
    } else {
      const list = res.data.providers || [];
      setProviders(list);
      // Auto-select first if none selected
      if (!value && list.length > 0) {
        onChange(JSON.stringify({ name: list[0].name, provider: list[0].provider }));
      }
    }
    setLoading(false);
  }

  useEffect(() => { loadProviders(); }, []);

  if (loading) return <p className="text-xs text-gray-400">Loading inbox providers from Scalesends…</p>;
  if (error) return <p className="text-xs text-red-500">Failed to load providers: {error}</p>;
  if (providers.length === 0) return <p className="text-xs text-amber-500">No inbox providers found in Scalesends account.</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <label className="text-xs font-medium text-gray-600 dark:text-gray-400">Inbox Provider (Scalesends)</label>
        <button onClick={loadProviders} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      <select
        value={value || ""}
        onChange={e => onChange(e.target.value || null)}
        className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
      >
        <option value="" disabled>Select a provider…</option>
        {providers.map((p, i) => (
          <option key={i} value={JSON.stringify({ name: p.name, provider: p.provider })}>
            {p.name} ({p.provider})
          </option>
        ))}
      </select>
    </div>
  );
}
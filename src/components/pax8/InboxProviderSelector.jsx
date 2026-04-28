import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, ChevronDown, Check, Inbox } from "lucide-react";

export default function InboxProviderSelector({ value, onChange }) {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

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
      if (!value && list.length > 0) {
        onChange(JSON.stringify({ name: list[0].name, provider: list[0].provider }));
      }
    }
    setLoading(false);
  }

  useEffect(() => { loadProviders(); }, []);

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const parsed = value ? (() => { try { return JSON.parse(value); } catch { return null; } })() : null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
        <RefreshCw className="w-3.5 h-3.5 animate-spin text-gray-400" />
        <span className="text-xs text-gray-400">Loading providers from Scalesends…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center justify-between px-3 py-2.5 rounded-xl border border-red-200 dark:border-red-500/20 bg-red-50 dark:bg-red-500/5">
        <span className="text-xs text-red-500">Failed to load: {error}</span>
        <button onClick={loadProviders} className="text-red-400 hover:text-red-600"><RefreshCw className="w-3 h-3" /></button>
      </div>
    );
  }
  if (providers.length === 0) {
    return (
      <div className="px-3 py-2.5 rounded-xl border border-amber-200 dark:border-amber-500/20 bg-amber-50 dark:bg-amber-500/5">
        <span className="text-xs text-amber-500">No inbox providers found in Scalesends.</span>
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">Inbox Provider</label>
        <button onClick={(e) => { e.stopPropagation(); loadProviders(); }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border text-left transition-all duration-150 ${
          open
            ? "border-blue-400 dark:border-blue-500 ring-2 ring-blue-400/20 bg-white dark:bg-gray-900"
            : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 hover:border-gray-300 dark:hover:border-gray-600"
        }`}
      >
        <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
          <Inbox className="w-3.5 h-3.5 text-blue-500" />
        </div>
        <div className="flex-1 min-w-0">
          {parsed ? (
            <>
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{parsed.name}</p>
              <p className="text-[11px] text-gray-400 truncate">{parsed.provider}</p>
            </>
          ) : (
            <p className="text-sm text-gray-400">Select a provider…</p>
          )}
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-150 shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute z-50 mt-1.5 w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-xl shadow-black/10 dark:shadow-black/30 overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150">
          {providers.map((p, i) => {
            const val = JSON.stringify({ name: p.name, provider: p.provider });
            const isSelected = value === val;
            return (
              <button
                key={i}
                type="button"
                onClick={() => { onChange(val); setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
                  isSelected
                    ? "bg-blue-50 dark:bg-blue-500/10"
                    : "hover:bg-gray-50 dark:hover:bg-gray-800/50"
                } ${i > 0 ? "border-t border-gray-100 dark:border-gray-800" : ""}`}
              >
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                  isSelected ? "bg-blue-500 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-400"
                }`}>
                  {isSelected ? <Check className="w-3.5 h-3.5" /> : <Inbox className="w-3.5 h-3.5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium truncate ${isSelected ? "text-blue-600 dark:text-blue-400" : "text-gray-900 dark:text-white"}`}>{p.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{p.provider}</p>
                </div>
                {isSelected && <Check className="w-4 h-4 text-blue-500 shrink-0" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
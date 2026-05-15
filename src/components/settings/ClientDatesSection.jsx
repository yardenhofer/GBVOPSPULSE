import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { CalendarDays, Save, Loader2, Search } from "lucide-react";

export default function ClientDatesSection() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState({});
  const [edits, setEdits] = useState({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    base44.entities.Client.list("-name", 200).then(c => {
      setClients(c.filter(cl => cl.status !== "Terminated"));
      setLoading(false);
    });
  }, []);

  function getField(clientId, field) {
    if (edits[clientId] && edits[clientId][field] !== undefined) return edits[clientId][field];
    const c = clients.find(cl => cl.id === clientId);
    return c?.[field] || "";
  }

  function handleChange(clientId, field, value) {
    setEdits(prev => ({
      ...prev,
      [clientId]: { ...(prev[clientId] || {}), [field]: value }
    }));
  }

  async function handleSave(clientId) {
    const changes = edits[clientId];
    if (!changes || Object.keys(changes).length === 0) return;
    setSaving(s => ({ ...s, [clientId]: true }));

    const payload = {};
    if (changes.start_date !== undefined) payload.start_date = changes.start_date || null;
    if (changes.contract_end_date !== undefined) payload.contract_end_date = changes.contract_end_date || null;
    if (changes.min_contract_months !== undefined) payload.min_contract_months = changes.min_contract_months !== "" ? Number(changes.min_contract_months) : null;

    await base44.entities.Client.update(clientId, payload);
    setClients(prev => prev.map(c => c.id === clientId ? { ...c, ...payload } : c));
    setEdits(prev => { const n = { ...prev }; delete n[clientId]; return n; });
    setSaving(s => ({ ...s, [clientId]: false }));
  }

  const filtered = clients.filter(c =>
    !search || c.name?.toLowerCase().includes(search.toLowerCase())
  );

  if (loading) {
    return <div className="h-32 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />;
  }

  const inputCls = "text-sm px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-3">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          placeholder="Search clients…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full text-sm pl-9 pr-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* Header */}
      <div className="hidden sm:grid grid-cols-[1fr_120px_120px_90px_50px] gap-3 px-3 text-xs font-semibold text-gray-400 uppercase tracking-wider">
        <span>Client</span>
        <span>Start Date</span>
        <span>End Date</span>
        <span>Min Months</span>
        <span></span>
      </div>

      {/* Rows */}
      <div className="space-y-1">
        {filtered.map(c => {
          const hasEdits = edits[c.id] && Object.keys(edits[c.id]).length > 0;
          return (
            <div key={c.id} className="grid grid-cols-1 sm:grid-cols-[1fr_120px_120px_90px_50px] gap-2 sm:gap-3 items-center px-3 py-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              <div className="min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{c.name}</p>
                <p className="text-xs text-gray-500">{c.package_type || "—"} · G{c.group || "—"}</p>
              </div>

              <div>
                <label className="text-xs text-gray-500 sm:hidden">Start Date</label>
                <input
                  type="date"
                  value={getField(c.id, "start_date")}
                  onChange={e => handleChange(c.id, "start_date", e.target.value)}
                  className={inputCls + " w-full"}
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 sm:hidden">End Date</label>
                <input
                  type="date"
                  value={getField(c.id, "contract_end_date")}
                  onChange={e => handleChange(c.id, "contract_end_date", e.target.value)}
                  className={inputCls + " w-full"}
                />
              </div>

              <div>
                <label className="text-xs text-gray-500 sm:hidden">Min Months</label>
                <input
                  type="number"
                  min="1"
                  placeholder="—"
                  value={getField(c.id, "min_contract_months")}
                  onChange={e => handleChange(c.id, "min_contract_months", e.target.value)}
                  className={inputCls + " w-full text-center"}
                />
              </div>

              <div className="flex justify-end sm:justify-center">
                {hasEdits && (
                  <button
                    onClick={() => handleSave(c.id)}
                    disabled={!!saving[c.id]}
                    className="p-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors disabled:opacity-50"
                    title="Save"
                  >
                    {saving[c.id] ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filtered.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-6">No clients found.</p>
        )}
      </div>
    </div>
  );
}
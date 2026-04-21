import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Star, Pencil, X, Check } from "lucide-react";

export default function InboxProviderManager() {
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ display_name: "", provider_name: "", provider_type: "instantly" });
  const [editForm, setEditForm] = useState({});

  async function load() {
    setLoading(true);
    const list = await base44.entities.InboxProvider.list("-created_date", 50);
    setProviders(list);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!form.display_name || !form.provider_name) return;
    await base44.entities.InboxProvider.create(form);
    setForm({ display_name: "", provider_name: "", provider_type: "instantly" });
    setAdding(false);
    await load();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this inbox provider?")) return;
    await base44.entities.InboxProvider.delete(id);
    await load();
  }

  async function handleSetDefault(id) {
    // Unset all defaults first
    for (const p of providers) {
      if (p.is_default) await base44.entities.InboxProvider.update(p.id, { is_default: false });
    }
    await base44.entities.InboxProvider.update(id, { is_default: true });
    await load();
  }

  async function handleSaveEdit(id) {
    await base44.entities.InboxProvider.update(id, editForm);
    setEditingId(null);
    await load();
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Inbox Providers (Scalesends)</h4>
        <button onClick={() => setAdding(!adding)} className="text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add
        </button>
      </div>
      <p className="text-xs text-gray-400">These are passed as <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">inboxProvider</code> in the Scalesends order payload.</p>

      {adding && (
        <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-3 space-y-2 bg-blue-50/50 dark:bg-blue-500/5">
          <input placeholder="Display name (e.g. Growth Team GBV)" value={form.display_name}
            onChange={e => setForm({ ...form, display_name: e.target.value })}
            className="w-full text-xs px-2.5 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
          <input placeholder='Scalesends name (e.g. Instantly - Growth Team)' value={form.provider_name}
            onChange={e => setForm({ ...form, provider_name: e.target.value })}
            className="w-full text-xs px-2.5 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
          <input placeholder="Provider type (e.g. instantly)" value={form.provider_type}
            onChange={e => setForm({ ...form, provider_type: e.target.value })}
            className="w-full text-xs px-2.5 py-1.5 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
          <div className="flex gap-2">
            <button onClick={handleAdd} className="text-xs px-3 py-1 rounded bg-blue-600 text-white hover:bg-blue-700">Save</button>
            <button onClick={() => setAdding(false)} className="text-xs px-3 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-xs text-gray-400">Loading…</p>
      ) : providers.length === 0 ? (
        <p className="text-xs text-gray-400 italic">No providers configured. Add one to include inboxProvider in Scalesends orders.</p>
      ) : (
        <div className="space-y-1.5">
          {providers.map(p => (
            <div key={p.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-100 dark:border-gray-800">
              {editingId === p.id ? (
                <div className="flex-1 space-y-1.5">
                  <input value={editForm.display_name} onChange={e => setEditForm({ ...editForm, display_name: e.target.value })}
                    className="w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                  <input value={editForm.provider_name} onChange={e => setEditForm({ ...editForm, provider_name: e.target.value })}
                    className="w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                  <input value={editForm.provider_type} onChange={e => setEditForm({ ...editForm, provider_type: e.target.value })}
                    className="w-full text-xs px-2 py-1 rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white" />
                  <div className="flex gap-1">
                    <button onClick={() => handleSaveEdit(p.id)} className="text-xs p-1 rounded bg-green-600 text-white"><Check className="w-3 h-3" /></button>
                    <button onClick={() => setEditingId(null)} className="text-xs p-1 rounded bg-gray-300 dark:bg-gray-600 text-gray-700 dark:text-gray-300"><X className="w-3 h-3" /></button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-900 dark:text-white">{p.display_name}</span>
                      {p.is_default && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">Default</span>}
                    </div>
                    <p className="text-xs text-gray-400 truncate">→ {p.provider_name} ({p.provider_type})</p>
                  </div>
                  <button onClick={() => handleSetDefault(p.id)} title="Set as default"
                    className={`p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 ${p.is_default ? "text-amber-500" : "text-gray-300 dark:text-gray-600"}`}>
                    <Star className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setEditingId(p.id); setEditForm({ display_name: p.display_name, provider_name: p.provider_name, provider_type: p.provider_type }); }}
                    className="p-1 rounded text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 hover:text-gray-600">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="p-1 rounded text-gray-400 hover:bg-red-100 dark:hover:bg-red-500/10 hover:text-red-500">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
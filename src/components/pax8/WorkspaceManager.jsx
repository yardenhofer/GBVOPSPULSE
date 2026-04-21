import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Star, Eye, EyeOff, Pencil, Check, X } from "lucide-react";

export default function WorkspaceManager() {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [visibleKeys, setVisibleKeys] = useState(new Set());
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editKey, setEditKey] = useState("");

  async function load() {
    setLoading(true);
    const list = await base44.entities.InstantlyWorkspace.list("-created_date", 100);
    setWorkspaces(list);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!newName.trim() || !newKey.trim()) return;
    setSaving(true);
    await base44.entities.InstantlyWorkspace.create({ name: newName.trim(), api_key: newKey.trim() });
    setNewName(""); setNewKey(""); setShowAdd(false); setSaving(false);
    await load();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this workspace?")) return;
    await base44.entities.InstantlyWorkspace.delete(id);
    await load();
  }

  async function handleSetDefault(id) {
    // Unset all defaults first
    for (const ws of workspaces) {
      if (ws.is_default) await base44.entities.InstantlyWorkspace.update(ws.id, { is_default: false });
    }
    await base44.entities.InstantlyWorkspace.update(id, { is_default: true });
    await load();
  }

  async function handleSaveEdit(id) {
    if (!editName.trim() || !editKey.trim()) return;
    await base44.entities.InstantlyWorkspace.update(id, { name: editName.trim(), api_key: editKey.trim() });
    setEditingId(null);
    await load();
  }

  function toggleKeyVisibility(id) {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function maskKey(key) {
    if (!key) return "—";
    if (key.length <= 8) return "••••••••";
    return key.substring(0, 4) + "••••" + key.substring(key.length - 4);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Instantly Workspaces</h4>
          <p className="text-xs text-gray-400 mt-0.5">Manage destination workspaces for completed inboxes</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium">
          <Plus className="w-3 h-3" /> Add Workspace
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2 border border-gray-200 dark:border-gray-700">
          <input type="text" placeholder="Workspace name (e.g. Client ABC)" value={newName} onChange={e => setNewName(e.target.value)}
            className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
          <input type="text" placeholder="Instantly API Key" value={newKey} onChange={e => setNewKey(e.target.value)}
            className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono" />
          <div className="flex justify-end gap-2">
            <button onClick={() => { setShowAdd(false); setNewName(""); setNewKey(""); }}
              className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700">Cancel</button>
            <button onClick={handleAdd} disabled={saving || !newName.trim() || !newKey.trim()}
              className="text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium">
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      )}

      {/* Workspace list */}
      {loading ? (
        <p className="text-xs text-gray-400 text-center py-4">Loading…</p>
      ) : workspaces.length === 0 ? (
        <p className="text-xs text-gray-400 text-center py-4">No workspaces added yet. Add one to get started.</p>
      ) : (
        <div className="space-y-1.5">
          {workspaces.map(ws => (
            <div key={ws.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/40 border border-gray-100 dark:border-gray-800 group">
              {editingId === ws.id ? (
                <>
                  <div className="flex-1 flex gap-2">
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                      className="flex-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    <input type="text" value={editKey} onChange={e => setEditKey(e.target.value)}
                      className="flex-1 text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono" />
                  </div>
                  <button onClick={() => handleSaveEdit(ws.id)} className="text-green-600 hover:text-green-700"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => setEditingId(null)} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
                </>
              ) : (
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-gray-900 dark:text-white truncate">{ws.name}</span>
                      {ws.is_default && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-400 font-medium">Default</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className="text-xs font-mono text-gray-400">{visibleKeys.has(ws.id) ? ws.api_key : maskKey(ws.api_key)}</span>
                      <button onClick={() => toggleKeyVisibility(ws.id)} className="text-gray-300 hover:text-gray-500">
                        {visibleKeys.has(ws.id) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                      </button>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!ws.is_default && (
                      <button onClick={() => handleSetDefault(ws.id)} title="Set as default"
                        className="text-gray-300 hover:text-amber-500"><Star className="w-3.5 h-3.5" /></button>
                    )}
                    <button onClick={() => { setEditingId(ws.id); setEditName(ws.name); setEditKey(ws.api_key); }} title="Edit"
                      className="text-gray-300 hover:text-blue-500"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDelete(ws.id)} title="Delete"
                      className="text-gray-300 hover:text-red-500"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Plus, Trash2, Star, Pencil, Check, X, Shield } from "lucide-react";

export default function WorkspaceManager() {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newKey, setNewKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState("");
  const [editKey, setEditKey] = useState("");

  async function load() {
    setLoading(true);
    const res = await base44.functions.invoke("workspaceManager", { action: "list" });
    setWorkspaces(res.data.workspaces || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function handleAdd() {
    if (!newName.trim() || !newKey.trim()) return;
    setSaving(true);
    await base44.functions.invoke("workspaceManager", { action: "create", name: newName.trim(), api_key: newKey.trim() });
    setNewName(""); setNewKey(""); setShowAdd(false); setSaving(false);
    await load();
  }

  async function handleDelete(id) {
    if (!confirm("Delete this workspace?")) return;
    await base44.functions.invoke("workspaceManager", { action: "delete", id });
    await load();
  }

  async function handleSetDefault(id) {
    await base44.functions.invoke("workspaceManager", { action: "setDefault", id });
    await load();
  }

  async function handleSaveEdit(id) {
    if (!editName.trim()) return;
    const payload = { action: "update", id, name: editName.trim() };
    if (editKey.trim()) payload.api_key = editKey.trim();
    await base44.functions.invoke("workspaceManager", payload);
    setEditingId(null);
    setEditKey("");
    await load();
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-green-500" /> Instantly Workspaces
          </h4>
          <p className="text-xs text-gray-400 mt-0.5">API keys are encrypted and never exposed to the browser</p>
        </div>
        <button onClick={() => setShowAdd(!showAdd)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium">
          <Plus className="w-3 h-3" /> Add Workspace
        </button>
      </div>

      {showAdd && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 space-y-2 border border-gray-200 dark:border-gray-700">
          <input type="text" placeholder="Workspace name (e.g. Client ABC)" value={newName} onChange={e => setNewName(e.target.value)}
            className="w-full text-sm px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
          <input type="password" placeholder="Instantly API Key" value={newKey} onChange={e => setNewKey(e.target.value)}
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
                  <div className="flex-1 space-y-1.5">
                    <input type="text" value={editName} onChange={e => setEditName(e.target.value)}
                      className="w-full text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white" />
                    <input type="password" value={editKey} onChange={e => setEditKey(e.target.value)} placeholder="New API key (leave blank to keep current)"
                      className="w-full text-xs px-2 py-1 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-white font-mono" />
                  </div>
                  <button onClick={() => handleSaveEdit(ws.id)} className="text-green-600 hover:text-green-700"><Check className="w-3.5 h-3.5" /></button>
                  <button onClick={() => { setEditingId(null); setEditKey(""); }} className="text-gray-400 hover:text-gray-600"><X className="w-3.5 h-3.5" /></button>
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
                    <span className="text-xs font-mono text-gray-400 mt-0.5 block">{ws.api_key_masked}</span>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!ws.is_default && (
                      <button onClick={() => handleSetDefault(ws.id)} title="Set as default"
                        className="text-gray-300 hover:text-amber-500"><Star className="w-3.5 h-3.5" /></button>
                    )}
                    <button onClick={() => { setEditingId(ws.id); setEditName(ws.name); setEditKey(""); }} title="Edit"
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
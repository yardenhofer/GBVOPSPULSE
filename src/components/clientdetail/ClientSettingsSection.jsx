import { useState } from "react";
import { Settings } from "lucide-react";
import { base44 } from "@/api/base44Client";

const SENTIMENTS = ["Happy", "Neutral", "Slightly Concerned", "Unhappy"];
const STATUSES = ["Healthy", "Monitor", "At Risk", "Critical"];
const PACKAGES = ["PPL", "Retainer", "Hybrid"];

export default function ClientSettingsSection({ client, onClientUpdate }) {
  const [form, setForm] = useState({
    name: client.name || "",
    package_type: client.package_type || "PPL",
    assigned_am: client.assigned_am || "",
    group: client.group ?? "",
    status: client.status || "Healthy",
    client_sentiment: client.client_sentiment || "Happy",
    target_leads_per_week: client.target_leads_per_week ?? "",
    revenue: client.revenue ?? "",
    start_date: client.start_date || "",
    last_am_touchpoint: client.last_am_touchpoint || "",
    last_client_reply_date: client.last_client_reply_date || "",
    waiting_on_leads: client.waiting_on_leads || false,
    waiting_since: client.waiting_since || "",
    is_escalated: client.is_escalated || false,
    unhappy_since: client.unhappy_since || "",
    notes: client.notes || "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    const payload = {
      ...form,
      target_leads_per_week: form.target_leads_per_week !== "" ? Number(form.target_leads_per_week) : null,
      revenue: form.revenue !== "" ? Number(form.revenue) : null,
      group: form.group !== "" ? Number(form.group) : null,
    };
    // Auto-set unhappy_since if sentiment changed to Unhappy and not already set
    if (form.client_sentiment === "Unhappy" && !form.unhappy_since) {
      payload.unhappy_since = new Date().toISOString().slice(0, 10);
    }
    if (form.client_sentiment !== "Unhappy") {
      payload.unhappy_since = null;
    }
    await base44.entities.Client.update(client.id, payload);
    onClientUpdate(payload);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const F = ({ label, children }) => (
    <div>
      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
      {children}
    </div>
  );

  const inputCls = "w-full text-sm px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500";
  const selectCls = inputCls;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Client Settings</h3>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-400">Saved ✓</span>}
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <F label="Client Name"><input type="text" className={inputCls} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></F>
        <F label="Assigned AM (email)"><input type="text" className={inputCls} value={form.assigned_am} onChange={e => setForm(f => ({ ...f, assigned_am: e.target.value }))} /></F>
        <F label="Package">
          <select className={selectCls} value={form.package_type} onChange={e => setForm(f => ({ ...f, package_type: e.target.value }))}>
            {PACKAGES.map(p => <option key={p}>{p}</option>)}
          </select>
        </F>
        <F label="Status">
          <select className={selectCls} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
            {STATUSES.map(s => <option key={s}>{s}</option>)}
          </select>
        </F>
        <F label="Sentiment">
          <select className={selectCls} value={form.client_sentiment} onChange={e => setForm(f => ({ ...f, client_sentiment: e.target.value }))}>
            {SENTIMENTS.map(s => <option key={s}>{s}</option>)}
          </select>
        </F>
        <F label="Target Leads / Week"><input type="number" className={inputCls} value={form.target_leads_per_week} onChange={e => setForm(f => ({ ...f, target_leads_per_week: e.target.value }))} /></F>
        <F label="Revenue (monthly $)"><input type="number" className={inputCls} value={form.revenue} onChange={e => setForm(f => ({ ...f, revenue: e.target.value }))} /></F>
        <F label="Start Date"><input type="date" className={inputCls} value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></F>
        <F label="Last AM Touchpoint"><input type="date" className={inputCls} value={form.last_am_touchpoint} onChange={e => setForm(f => ({ ...f, last_am_touchpoint: e.target.value }))} /></F>
        <F label="Last Client Reply"><input type="date" className={inputCls} value={form.last_client_reply_date} onChange={e => setForm(f => ({ ...f, last_client_reply_date: e.target.value }))} /></F>
      </div>

      <div className="mt-3 flex flex-wrap gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
          <input type="checkbox" className="rounded" checked={form.waiting_on_leads} onChange={e => {
            setForm(f => ({ ...f, waiting_on_leads: e.target.checked, waiting_since: e.target.checked ? (f.waiting_since || new Date().toISOString().slice(0, 10)) : "" }));
          }} />
          Waiting on Leads
          {form.waiting_on_leads && (
            <input type="date" value={form.waiting_since} onChange={e => setForm(f => ({ ...f, waiting_since: e.target.value }))}
              className="ml-1 text-xs px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 focus:outline-none" />
          )}
        </label>
        <label className="flex items-center gap-2 text-xs text-red-500 cursor-pointer select-none">
          <input type="checkbox" className="rounded" checked={form.is_escalated} onChange={e => setForm(f => ({ ...f, is_escalated: e.target.checked }))} />
          Escalated
        </label>
      </div>

      <div className="mt-3">
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Internal Notes</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
          className="w-full text-sm px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
    </div>
  );
}
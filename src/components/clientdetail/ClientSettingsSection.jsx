import { useState, useEffect } from "react";
import { Settings, ChevronDown } from "lucide-react";
import { base44 } from "@/api/base44Client";

const SENTIMENTS = ["Happy", "Neutral", "Slightly Concerned", "Unhappy"];
const STATUSES = ["Healthy", "Monitor", "At Risk", "Critical"];
const PACKAGES = ["Email", "LinkedIn", "Hybrid"];

export default function ClientSettingsSection({ client, onClientUpdate }) {
  const [form, setForm] = useState({
    name: client.name || "",
    package_type: client.package_type || "Email",
    assigned_am: client.assigned_am || "",
    group: client.group ?? "",
    status: client.status || "Healthy",
    client_sentiment: client.client_sentiment || "Happy",
    target_leads_per_week: client.target_leads_per_week ?? "",
    revenue: client.revenue ?? "",
    start_date: client.start_date || "",
    contract_end_date: client.contract_end_date || "",
    last_am_touchpoint: client.last_am_touchpoint || "",
    last_client_reply_date: client.last_client_reply_date || "",
    waiting_on_leads: client.waiting_on_leads || false,
    waiting_since: client.waiting_since || "",
    is_escalated: client.is_escalated || false,
    unhappy_since: client.unhappy_since || "",
    notes: client.notes || "",
    instantly_api_key: client.instantly_api_key || "",
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
      contract_end_date: form.contract_end_date || null,
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

  const Sel = ({ value, onChange, options }) => (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        className="appearance-none w-full text-sm pl-3 pr-8 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
      >
        {options.map(o => <option key={o}>{o}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
    </div>
  );

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
        <F label="Group #"><input type="number" min="1" className={inputCls} value={form.group} placeholder="—" onChange={e => setForm(f => ({ ...f, group: e.target.value }))} /></F>
        <F label="Package">
          <Sel value={form.package_type} onChange={e => setForm(f => ({ ...f, package_type: e.target.value }))} options={PACKAGES} />
        </F>
        <F label="Status">
          <Sel value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} options={STATUSES} />
        </F>
        <F label="Sentiment">
          <Sel value={form.client_sentiment} onChange={e => setForm(f => ({ ...f, client_sentiment: e.target.value }))} options={SENTIMENTS} />
        </F>
        <F label="Target Leads / Week"><input type="number" className={inputCls} value={form.target_leads_per_week} onChange={e => setForm(f => ({ ...f, target_leads_per_week: e.target.value }))} /></F>
        <F label="Revenue (monthly $)"><input type="number" className={inputCls} value={form.revenue} onChange={e => setForm(f => ({ ...f, revenue: e.target.value }))} /></F>
        <F label="Start Date"><input type="date" className={inputCls} value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} /></F>
        <F label="Contract End Date"><input type="date" className={inputCls} value={form.contract_end_date} onChange={e => setForm(f => ({ ...f, contract_end_date: e.target.value }))} /></F>
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
          <input type="checkbox" className="rounded" checked={form.is_escalated} onChange={async e => {
            const isEscalated = e.target.checked;
            setForm(f => ({ ...f, is_escalated: isEscalated }));
            await base44.entities.Client.update(client.id, { is_escalated: isEscalated });
            onClientUpdate({ is_escalated: isEscalated });
            if (isEscalated) {
              base44.functions.invoke('autoSlackAlerts', { trigger: 'escalated', client_id: client.id });
            }
          }} />
          Escalated
        </label>
      </div>

      <div className="mt-3">
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Instantly API Key</label>
        <input type="password" className={inputCls} value={form.instantly_api_key} placeholder="Paste client's Instantly API key…"
          onChange={e => setForm(f => ({ ...f, instantly_api_key: e.target.value }))} />
      </div>

      <div className="mt-3">
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Internal Notes</label>
        <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2}
          className="w-full text-sm px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
    </div>
  );
}
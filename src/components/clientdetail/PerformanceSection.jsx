import { useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { base44 } from "@/api/base44Client";

export default function PerformanceSection({ client, onClientUpdate }) {
  const [form, setForm] = useState({
    leads_this_week: client.leads_this_week ?? "",
    leads_last_week: client.leads_last_week ?? "",
    meetings_booked: client.meetings_booked ?? "",
    close_rate: client.close_rate ?? "",
    client_feedback: client.client_feedback ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSave() {
    setSaving(true);
    const payload = {
      leads_this_week: form.leads_this_week !== "" ? Number(form.leads_this_week) : null,
      leads_last_week: form.leads_last_week !== "" ? Number(form.leads_last_week) : null,
      meetings_booked: form.meetings_booked !== "" ? Number(form.meetings_booked) : null,
      close_rate: form.close_rate !== "" ? Number(form.close_rate) : null,
      client_feedback: form.client_feedback,
    };
    await base44.entities.Client.update(client.id, payload);
    onClientUpdate(payload);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const target = client.target_leads_per_week || 0;
  const thisWeek = Number(form.leads_this_week) || 0;
  const lastWeek = Number(form.leads_last_week) || 0;
  const vsTarget = target > 0 ? Math.round((thisWeek / target) * 100) : null;
  const vsLast = lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null;

  const TrendIcon = vsLast === null ? Minus : vsLast > 0 ? TrendingUp : vsLast < 0 ? TrendingDown : Minus;
  const trendColor = vsLast === null ? "text-gray-400" : vsLast > 0 ? "text-green-400" : vsLast < 0 ? "text-red-400" : "text-gray-400";

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Performance</h3>
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

      {/* Trend summary */}
      {vsTarget !== null && (
        <div className="flex items-center gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg">
          <div className={`flex items-center gap-1.5 text-sm font-bold ${vsTarget >= 100 ? "text-green-400" : vsTarget >= 70 ? "text-yellow-400" : "text-red-400"}`}>
            {vsTarget}% of target
          </div>
          {vsLast !== null && (
            <div className={`flex items-center gap-1 text-sm font-semibold ${trendColor}`}>
              <TrendIcon className="w-4 h-4" />
              {vsLast > 0 ? "+" : ""}{vsLast}% vs last week
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        {[
          { key: "leads_this_week", label: "Leads This Week", type: "number" },
          { key: "leads_last_week", label: "Leads Last Week", type: "number" },
          { key: "meetings_booked", label: "Meetings Booked", type: "number" },
          { key: "close_rate", label: "Close Rate (%)", type: "number" },
        ].map(({ key, label, type }) => (
          <div key={key}>
            <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">{label}</label>
            <input
              type={type}
              min="0"
              value={form[key]}
              onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
              className="w-full text-sm px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        ))}
      </div>

      <div className="mt-3">
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Client Feedback</label>
        <textarea
          value={form.client_feedback}
          onChange={e => setForm(f => ({ ...f, client_feedback: e.target.value }))}
          rows={2}
          placeholder="Any client comments..."
          className="w-full text-sm px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
    </div>
  );
}
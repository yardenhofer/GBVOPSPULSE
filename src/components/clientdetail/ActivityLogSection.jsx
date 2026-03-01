import { useState, useEffect } from "react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { MessageSquare, Plus, AlertCircle, Phone, Mail, Slack, Lightbulb } from "lucide-react";

const TYPES = ["Call", "Email", "Slack", "Strategy", "Issue"];
const TYPE_ICONS = { Call: Phone, Email: Mail, Slack: Slack, Strategy: Lightbulb, Issue: AlertCircle };
const TYPE_COLORS = {
  Call: "text-green-400 bg-green-500/10",
  Email: "text-blue-400 bg-blue-500/10",
  Slack: "text-purple-400 bg-purple-500/10",
  Strategy: "text-cyan-400 bg-cyan-500/10",
  Issue: "text-red-400 bg-red-500/10",
};

export default function ActivityLogSection({ client }) {
  const [logs, setLogs] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ type: "Call", note: "", follow_up_needed: false, date: new Date().toISOString().slice(0, 10) });
  const [saving, setSaving] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    loadLogs();
  }, [client.id]);

  async function loadLogs() {
    const data = await base44.entities.ActivityLog.filter({ client_id: client.id }, "-date", 20);
    setLogs(data);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.note.trim()) return;
    setSaving(true);
    await base44.entities.ActivityLog.create({ ...form, client_id: client.id, am_email: user?.email });
    // Update last touchpoint on client
    await base44.entities.Client.update(client.id, { last_am_touchpoint: form.date });
    if (user) {
      base44.entities.UserActivity.create({
        user_email: user.email,
        user_name: user.full_name || user.email,
        action: "activity_logged",
        detail: `Logged ${form.type}: ${form.note.slice(0, 80)}`,
        client_name: client.name,
      });
    }
    setForm({ type: "Call", note: "", follow_up_needed: false, date: new Date().toISOString().slice(0, 10) });
    setShowForm(false);
    setSaving(false);
    loadLogs();
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MessageSquare className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Activity Log</h3>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-1 text-xs font-medium text-blue-500 hover:text-blue-600 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Log Activity
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 space-y-2 p-3 bg-gray-50 dark:bg-gray-800/60 rounded-lg">
          <div className="flex gap-2 flex-wrap">
            {TYPES.map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setForm(f => ({ ...f, type: t }))}
                className={`text-xs font-medium px-2.5 py-1 rounded-md transition-all border
                  ${form.type === t ? `${TYPE_COLORS[t]} border-current` : "border-gray-200 dark:border-gray-600 text-gray-500"}`}
              >
                {t}
              </button>
            ))}
          </div>
          <input
            type="date"
            value={form.date}
            onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
            className="w-full text-sm px-2.5 py-1.5 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <textarea
            placeholder="What happened?"
            value={form.note}
            onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
            rows={2}
            className="w-full text-sm px-2.5 py-1.5 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-600 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={form.follow_up_needed}
              onChange={e => setForm(f => ({ ...f, follow_up_needed: e.target.checked }))}
              className="rounded"
            />
            Follow-up needed
          </label>
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg transition-colors">Cancel</button>
            <button type="submit" disabled={saving} className="text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50">
              {saving ? "Saving…" : "Log"}
            </button>
          </div>
        </form>
      )}

      <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
        {logs.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-4">No activity logged yet.</p>
        ) : logs.map(log => {
          const Icon = TYPE_ICONS[log.type] || MessageSquare;
          return (
            <div key={log.id} className="flex gap-2.5 py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
              <div className={`w-6 h-6 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${TYPE_COLORS[log.type] || ""}`}>
                <Icon className="w-3 h-3" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-semibold uppercase tracking-wide ${TYPE_COLORS[log.type]?.split(" ")[0] || "text-gray-400"}`}>{log.type}</span>
                  <span className="text-[10px] text-gray-400">{log.date ? format(new Date(log.date), "MMM d") : ""}</span>
                  {log.follow_up_needed && <span className="text-[10px] bg-orange-500/10 text-orange-400 px-1.5 rounded">Follow-up</span>}
                </div>
                <p className="text-xs text-gray-700 dark:text-gray-300">{log.note}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
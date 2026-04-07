import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ClipboardCheck, ExternalLink, ChevronDown, Save, Check, Star } from "lucide-react";

export default function DailyCheckIn() {
  const [myClients, setMyClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [checkIns, setCheckIns] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const today = format(new Date(), "yyyy-MM-dd");

  const [form, setForm] = useState({
    inmails_sent: "",
    emails_sent: "",
    leads_generated: "",
    satisfaction_rate: "",
    notes: "",
  });
  const [checkInId, setCheckInId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    async function load() {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      if (!u) { setLoading(false); return; }
      const [allClients, ci] = await Promise.all([
        base44.entities.Client.list("-name", 200),
        base44.entities.DailyCheckIn.filter({ am_email: u.email, date: today }),
      ]);
      const mine = allClients.filter(c => c.assigned_am === u.email && c.status !== "Terminated");
      setMyClients(mine);
      setCheckIns(ci);
      if (mine.length > 0) setSelectedClientId(mine[0].id);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedClientId) return;
    const existing = checkIns.find(c => c.client_id === selectedClientId);
    if (existing) {
      setForm({
        inmails_sent: existing.inmails_sent ?? "",
        emails_sent: existing.emails_sent ?? "",
        leads_generated: existing.leads_generated ?? "",
        satisfaction_rate: existing.satisfaction_rate ?? "",
        notes: existing.notes ?? "",
      });
      setCheckInId(existing.id);
    } else {
      setForm({ inmails_sent: "", emails_sent: "", leads_generated: "", satisfaction_rate: "", notes: "" });
      setCheckInId(null);
    }
    setSaved(false);
  }, [selectedClientId, checkIns]);

  const selectedClient = myClients.find(c => c.id === selectedClientId);

  async function handleSave() {
    if (!selectedClientId || !user) return;
    setSaving(true);
    const payload = {
      client_id: selectedClientId,
      client_name: selectedClient?.name || "",
      am_email: user.email,
      date: today,
      inmails_sent: form.inmails_sent !== "" ? Number(form.inmails_sent) : 0,
      emails_sent: form.emails_sent !== "" ? Number(form.emails_sent) : 0,
      leads_generated: form.leads_generated !== "" ? Number(form.leads_generated) : 0,
      satisfaction_rate: form.satisfaction_rate !== "" ? Number(form.satisfaction_rate) : null,
      notes: form.notes || "",
      completed: true,
    };

    if (checkInId) {
      await base44.entities.DailyCheckIn.update(checkInId, payload);
      setCheckIns(prev => prev.map(c => c.id === checkInId ? { ...c, ...payload } : c));
    } else {
      const created = await base44.entities.DailyCheckIn.create(payload);
      setCheckInId(created.id);
      setCheckIns(prev => [...prev, { ...payload, id: created.id }]);
    }
    base44.entities.UserActivity.create({
      user_email: user.email,
      user_name: user.full_name || user.email,
      action: "daily_checkin",
      detail: `Daily check-in for ${selectedClient?.name || "client"}`,
      client_name: selectedClient?.name || "",
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const completedCount = checkIns.filter(c => c.completed).length;
  const total = myClients.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const inputCls = "w-full text-sm px-3 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500";

  // Satisfaction rating component
  const SatisfactionPicker = () => {
    const rating = form.satisfaction_rate !== "" ? Number(form.satisfaction_rate) : 0;
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
          <button
            key={n}
            type="button"
            onClick={() => { setForm(f => ({ ...f, satisfaction_rate: n })); setSaved(false); }}
            className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
              n <= rating
                ? n <= 3 ? "bg-red-500 text-white" : n <= 6 ? "bg-yellow-500 text-white" : "bg-green-500 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    );
  };

  // Client status badges in selector
  const getStatusDot = (clientId) => {
    const ci = checkIns.find(c => c.client_id === clientId);
    if (ci?.completed) return "bg-green-500";
    return "bg-gray-300 dark:bg-gray-600";
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Daily Check-In</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{format(new Date(), "EEEE, MMMM d")}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{pct}%</p>
          <p className="text-xs text-gray-500">{completedCount}/{total} clients done</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? "bg-green-500" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {pct === 100 && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
          <p className="text-green-400 font-semibold">🎉 All check-ins complete for today!</p>
        </div>
      )}

      {loading ? (
        <div className="h-64 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
      ) : myClients.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No clients assigned to you yet.</p>
          <p className="text-sm mt-1">Ask an admin to assign clients to your email.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-5">
          {/* Client Selector */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">Account / Client</label>
            <div className="relative">
              <select
                value={selectedClientId}
                onChange={e => setSelectedClientId(e.target.value)}
                className="appearance-none w-full text-sm pl-3 pr-8 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
              >
                {myClients.map(c => {
                  const done = checkIns.find(ci => ci.client_id === c.id)?.completed;
                  return (
                    <option key={c.id} value={c.id}>
                      {done ? "✅ " : "⬜ "}{c.name} {c.group ? `(G${c.group})` : ""} — {c.package_type || "No pkg"}
                    </option>
                  );
                })}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
          </div>

          {selectedClient && (
            <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-gray-900 dark:text-white">{selectedClient.name}</p>
                <p className="text-xs text-gray-500">{selectedClient.package_type || "No package"} · Group {selectedClient.group || "—"}</p>
              </div>
              <button
                onClick={() => navigate(createPageUrl(`ClientDetail?id=${selectedClientId}`))}
                className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                View
              </button>
            </div>
          )}

          {/* Metrics Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">InMails Sent</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                placeholder="0"
                value={form.inmails_sent}
                onChange={e => { setForm(f => ({ ...f, inmails_sent: e.target.value })); setSaved(false); }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">Emails Sent</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                placeholder="0"
                value={form.emails_sent}
                onChange={e => { setForm(f => ({ ...f, emails_sent: e.target.value })); setSaved(false); }}
              />
            </div>
            <div>
              <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">Leads Generated</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                placeholder="0"
                value={form.leads_generated}
                onChange={e => { setForm(f => ({ ...f, leads_generated: e.target.value })); setSaved(false); }}
              />
            </div>
          </div>

          {/* Satisfaction Rate */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">
              Satisfaction Rate
              {form.satisfaction_rate !== "" && (
                <span className={`ml-2 font-semibold ${
                  Number(form.satisfaction_rate) <= 3 ? "text-red-500" : Number(form.satisfaction_rate) <= 6 ? "text-yellow-500" : "text-green-500"
                }`}>
                  {form.satisfaction_rate}/10
                </span>
              )}
            </label>
            <SatisfactionPicker />
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">Notes</label>
            <textarea
              className={inputCls + " h-24 resize-none"}
              placeholder="Any updates, blockers, or context for this client today..."
              value={form.notes}
              onChange={e => { setForm(f => ({ ...f, notes: e.target.value })); setSaved(false); }}
            />
          </div>

          {/* Save */}
          <div className="flex items-center justify-end pt-3 border-t border-gray-100 dark:border-gray-800">
            <div className="flex items-center gap-2">
              {saved && <span className="text-xs text-green-400 font-medium">Saved ✓</span>}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? "Saving…" : "Save Check-In"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
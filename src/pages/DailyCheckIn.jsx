import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ClipboardCheck, ExternalLink, ChevronDown, Save, Check } from "lucide-react";

const TASKS = [
  { key: "reviewed_lead_performance", label: "Reviewed lead performance" },
  { key: "checked_lead_list_status", label: "Checked lead list status" },
  { key: "confirmed_no_issues", label: "Confirmed no client issues" },
  { key: "logged_touchpoint", label: "Logged touchpoint (if applicable)" },
  { key: "updated_sentiment", label: "Updated sentiment" },
];

export default function DailyCheckIn() {
  const [myClients, setMyClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [checkIns, setCheckIns] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const today = format(new Date(), "yyyy-MM-dd");

  // Form state for selected client
  const [form, setForm] = useState({
    emails_sent: "",
    linkedin_messages_sent: "",
    inmails_sent: "",
    positive_responses: "",
  });
  const [checks, setChecks] = useState({
    reviewed_lead_performance: false,
    checked_lead_list_status: false,
    confirmed_no_issues: false,
    logged_touchpoint: false,
    updated_sentiment: false,
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
      const mine = allClients.filter(c => c.assigned_am === u.email);
      setMyClients(mine);
      setCheckIns(ci);
      if (mine.length > 0) setSelectedClientId(mine[0].id);
      setLoading(false);
    }
    load();
  }, []);

  // When selected client changes, load its check-in data
  useEffect(() => {
    if (!selectedClientId) return;
    const existing = checkIns.find(c => c.client_id === selectedClientId);
    if (existing) {
      setForm({
        emails_sent: existing.emails_sent ?? "",
        linkedin_messages_sent: existing.linkedin_messages_sent ?? "",
        inmails_sent: existing.inmails_sent ?? "",
        positive_responses: existing.positive_responses ?? "",
      });
      setChecks({
        reviewed_lead_performance: existing.reviewed_lead_performance || false,
        checked_lead_list_status: existing.checked_lead_list_status || false,
        confirmed_no_issues: existing.confirmed_no_issues || false,
        logged_touchpoint: existing.logged_touchpoint || false,
        updated_sentiment: existing.updated_sentiment || false,
      });
      setCheckInId(existing.id);
    } else {
      setForm({ emails_sent: "", linkedin_messages_sent: "", inmails_sent: "", positive_responses: "" });
      setChecks({
        reviewed_lead_performance: false,
        checked_lead_list_status: false,
        confirmed_no_issues: false,
        logged_touchpoint: false,
        updated_sentiment: false,
      });
      setCheckInId(null);
    }
    setSaved(false);
  }, [selectedClientId, checkIns]);

  const selectedClient = myClients.find(c => c.id === selectedClientId);
  const isHybrid = selectedClient?.package_type === "Hybrid";
  const isLinkedIn = selectedClient?.package_type === "LinkedIn";
  const showLinkedIn = isHybrid || isLinkedIn;

  async function handleSave() {
    if (!selectedClientId || !user) return;
    setSaving(true);
    const allDone = Object.values(checks).every(Boolean);
    const payload = {
      client_id: selectedClientId,
      am_email: user.email,
      date: today,
      emails_sent: form.emails_sent !== "" ? Number(form.emails_sent) : 0,
      linkedin_messages_sent: showLinkedIn && form.linkedin_messages_sent !== "" ? Number(form.linkedin_messages_sent) : 0,
      inmails_sent: showLinkedIn && form.inmails_sent !== "" ? Number(form.inmails_sent) : 0,
      positive_responses: form.positive_responses !== "" ? Number(form.positive_responses) : 0,
      ...checks,
      completed: allDone,
    };

    if (checkInId) {
      await base44.entities.DailyCheckIn.update(checkInId, payload);
    } else {
      const created = await base44.entities.DailyCheckIn.create(payload);
      setCheckInId(created.id);
      setCheckIns(prev => [...prev, { ...payload, id: created.id }]);
    }
    base44.entities.UserActivity.create({
      user_email: user.email,
      user_name: user.full_name || user.email,
      action: "daily_checkin",
      detail: `Submitted daily check-in${allDone ? " (completed)" : " (partial)"}`,
      client_name: selectedClient?.name || "",
    });
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function toggleCheck(key) {
    setChecks(prev => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  }

  const completed = checkIns.filter(c => c.completed).length;
  const total = myClients.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const inputCls = "w-full text-sm px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Daily Check-In</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{format(new Date(), "EEEE, MMMM d")}</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{pct}%</p>
          <p className="text-xs text-gray-500">{completed}/{total} clients done</p>
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
          {/* Client Selector + Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Client</label>
              <div className="relative">
                <select
                  value={selectedClientId}
                  onChange={e => setSelectedClientId(e.target.value)}
                  className="appearance-none w-full text-sm pl-3 pr-8 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                >
                  {myClients.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.group ? `(G${c.group})` : ""} — {c.package_type || "No pkg"}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Date</label>
              <input type="date" value={today} readOnly className={inputCls + " opacity-70 cursor-not-allowed"} />
            </div>
          </div>

          {/* Metrics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Emails Sent</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                placeholder="0"
                value={form.emails_sent}
                onChange={e => { setForm(f => ({ ...f, emails_sent: e.target.value })); setSaved(false); }}
              />
            </div>
            {showLinkedIn && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">LinkedIn Messages Sent</label>
                <input
                  type="number"
                  min="0"
                  className={inputCls}
                  placeholder="0"
                  value={form.linkedin_messages_sent}
                  onChange={e => { setForm(f => ({ ...f, linkedin_messages_sent: e.target.value })); setSaved(false); }}
                />
              </div>
            )}
            {showLinkedIn && (
              <div>
                <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">InMails Sent</label>
                <input
                  type="number"
                  min="0"
                  className={inputCls}
                  placeholder="0"
                  value={form.inmails_sent}
                  onChange={e => { setForm(f => ({ ...f, inmails_sent: e.target.value })); setSaved(false); }}
                />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Positive Responses (Email)</label>
              <input
                type="number"
                min="0"
                className={inputCls}
                placeholder="0"
                value={form.positive_responses}
                onChange={e => { setForm(f => ({ ...f, positive_responses: e.target.value })); setSaved(false); }}
              />
            </div>
          </div>

          {/* Checklist */}
          <div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Checklist</p>
            <div className="space-y-1.5">
              {TASKS.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => toggleCheck(key)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm
                    ${checks[key]
                      ? "bg-green-500/10 text-green-400"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                >
                  {checks[key]
                    ? <Check className="w-4 h-4 shrink-0" />
                    : <div className="w-4 h-4 shrink-0 rounded-full border border-gray-300 dark:border-gray-600" />
                  }
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Save + Navigate */}
          <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-800">
            <button
              onClick={() => navigate(createPageUrl(`ClientDetail?id=${selectedClientId}`))}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-400 transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              View Client
            </button>
            <div className="flex items-center gap-2">
              {saved && <span className="text-xs text-green-400">Saved ✓</span>}
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
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
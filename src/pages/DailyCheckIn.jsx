import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { format, getDay } from "date-fns";
import { ClipboardCheck, ExternalLink, ChevronDown, ChevronLeft, ChevronRight, Save, Star, Users, Calendar, AlertTriangle, Info } from "lucide-react";

function calcDailyEmailTarget(monthlyTarget) {
  if (!monthlyTarget) return null;
  return Math.round(monthlyTarget / 22);
}

function calcPriorityScore(revenue, openTaskCount) {
  // Revenue-weighted: $10k/mo client = 100 base, plus 10 per open task
  const revenueScore = (revenue || 0) / 100;
  const intensityScore = (openTaskCount || 0) * 10;
  return Math.round(revenueScore * 0.7 + intensityScore * 0.3);
}

function getPriorityFromScore(score) {
  if (score >= 80) return "critical";
  if (score >= 50) return "high";
  if (score >= 20) return "medium";
  return "low";
}

export default function DailyCheckIn() {
  const [allClients, setAllClients] = useState([]);
  const [myClients, setMyClients] = useState([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [checkIns, setCheckIns] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [amUsers, setAmUsers] = useState([]);
  const [selectedAm, setSelectedAm] = useState("");
  const navigate = useNavigate();

  const getLastWorkingDay = () => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    const dow = getDay(d);
    if (dow === 0) d.setDate(d.getDate() - 2);
    else if (dow === 6) d.setDate(d.getDate() - 1);
    return format(d, "yyyy-MM-dd");
  };
  const [selectedDate, setSelectedDate] = useState(getLastWorkingDay());
  const today = selectedDate;

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
  const [validationErrors, setValidationErrors] = useState([]);

  useEffect(() => {
    async function load() {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      if (!u) { setLoading(false); return; }
      const [fetchedClients, usersRes] = await Promise.all([
        base44.entities.Client.list("-name", 200),
        base44.functions.invoke("listUsers", {}).then(r => r.data.users || []).catch(() => []),
      ]);
      setAllClients(fetchedClients);
      const amEmails = [...new Set(fetchedClients.filter(c => c.assigned_am && c.status !== "Terminated").map(c => c.assigned_am))];
      const amList = amEmails.map(email => {
        const found = usersRes.find(u2 => u2.email === email);
        return { email, name: found?.full_name || email };
      }).sort((a, b) => a.name.localeCompare(b.name));
      setAmUsers(amList);
      const defaultAm = amEmails.includes(u.email) ? u.email : (amEmails[0] || "");
      setSelectedAm(defaultAm);
      setLoading(false);
    }
    load();
  }, []);

  useEffect(() => {
    if (!selectedAm || allClients.length === 0) return;
    const amClients = allClients.filter(c => c.assigned_am === selectedAm && c.status !== "Terminated");
    setMyClients(amClients);
    setSelectedClientId(amClients.length > 0 ? amClients[0].id : "");
    base44.entities.DailyCheckIn.filter({ am_email: selectedAm, date: today }).then(ci => setCheckIns(ci));
  }, [selectedAm, allClients, selectedDate]);

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
    setValidationErrors([]);
  }, [selectedClientId, checkIns]);

  const selectedClient = myClients.find(c => c.id === selectedClientId);
  const dailyEmailTarget = selectedClient ? calcDailyEmailTarget(selectedClient.monthly_sends_target) : null;

  function validate() {
    const errors = [];
    if (form.leads_generated === "" || form.leads_generated === null) {
      errors.push("Leads from yesterday is required");
    }
    if (form.emails_sent === "" || form.emails_sent === null) {
      errors.push("Emails sent is required");
    }
    return errors;
  }

  async function handleSave() {
    const errors = validate();
    if (errors.length > 0) {
      setValidationErrors(errors);
      return;
    }
    setValidationErrors([]);

    if (!selectedClientId || !user) return;
    setSaving(true);

    const emailsSent = form.emails_sent !== "" ? Number(form.emails_sent) : 0;
    const leadsGenerated = form.leads_generated !== "" ? Number(form.leads_generated) : 0;

    const payload = {
      client_id: selectedClientId,
      client_name: selectedClient?.name || "",
      am_email: selectedAm,
      date: today,
      inmails_sent: form.inmails_sent !== "" ? Number(form.inmails_sent) : 0,
      emails_sent: emailsSent,
      leads_generated: leadsGenerated,
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

    // Auto-create ops task if below KPI
    const weeklyTarget = selectedClient?.target_leads_per_week || 5;
    const leadsThisWeek = (selectedClient?.leads_this_week || 0) + leadsGenerated;
    const belowLeadKpi = leadsGenerated < Math.ceil(weeklyTarget / 5); // daily target = weekly / 5

    const belowEmailKpi = dailyEmailTarget && emailsSent < dailyEmailTarget * 0.7; // 70% threshold

    if ((belowLeadKpi || belowEmailKpi) && !checkInId) {
      // Check existing open tasks for this client to count intensity
      const existingTasks = await base44.entities.OpsTask.filter({ client_id: selectedClientId }).catch(() => []);
      const openTasks = existingTasks.filter(t => t.status === "open" || t.status === "in_progress");

      // Don't create duplicate daily task
      const todayStr = today;
      const alreadyHasToday = openTasks.some(t => t.trigger_detail && t.trigger_detail.includes(todayStr));
      
      if (!alreadyHasToday) {
        const score = calcPriorityScore(selectedClient?.revenue, openTasks.length);
        const priority = getPriorityFromScore(score);
        
        const triggers = [];
        if (belowLeadKpi) triggers.push(`${leadsGenerated} leads (target: ${Math.ceil(weeklyTarget / 5)}/day)`);
        if (belowEmailKpi) triggers.push(`${emailsSent} emails sent (target: ${dailyEmailTarget}/day)`);

        await base44.entities.OpsTask.create({
          client_id: selectedClientId,
          client_name: selectedClient?.name || "",
          trigger: belowLeadKpi ? "below_kpi" : "low_leads",
          trigger_detail: `${todayStr}: ${triggers.join(", ")}`,
          task_type: belowLeadKpi ? "expand_lead_list" : "adjust_copy",
          description: `Auto-flagged: ${selectedClient?.name} is underperforming. ${triggers.join(". ")}.`,
          priority,
          priority_score: score,
          client_revenue: selectedClient?.revenue || 0,
          assigned_to: "zain@growbigventures.com",
          assigned_by: "system",
          status: "open",
          am_email: selectedAm,
        });
      }
    }

    // Activity log + slack notification
    base44.entities.UserActivity.create({
      user_email: user.email,
      user_name: user.full_name || user.email,
      action: "daily_checkin",
      detail: `Daily check-in for ${selectedClient?.name || "client"}${selectedAm !== user.email ? ` (on behalf of ${selectedAm})` : ""}`,
      client_name: selectedClient?.name || "",
    });
    base44.functions.invoke("notifyDailyEntry", {
      client_name: selectedClient?.name || "",
      am_name: amUsers.find(a => a.email === selectedAm)?.name || selectedAm,
      am_email: selectedAm,
      date: today,
      leads_generated: payload.leads_generated,
      emails_sent: payload.emails_sent,
      inmails_sent: payload.inmails_sent,
      on_behalf: selectedAm !== user.email,
    }).catch(() => {});

    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  const completedCount = checkIns.filter(c => c.completed).length;
  const total = myClients.length;
  const pct = total > 0 ? Math.round((completedCount / total) * 100) : 0;

  const inputCls = "w-full text-sm px-3 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const SatisfactionPicker = () => {
    const rating = form.satisfaction_rate !== "" ? Number(form.satisfaction_rate) : 0;
    return (
      <div className="flex items-center gap-1">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
          <button key={n} type="button"
            onClick={() => { setForm(f => ({ ...f, satisfaction_rate: n })); setSaved(false); }}
            className={`w-8 h-8 rounded-lg text-xs font-semibold transition-all ${
              n <= rating
                ? n <= 3 ? "bg-red-500 text-white" : n <= 6 ? "bg-yellow-500 text-white" : "bg-green-500 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >{n}</button>
        ))}
      </div>
    );
  };

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Daily Check-In</h1>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={() => {
              const d = new Date(selectedDate + "T12:00:00");
              d.setDate(d.getDate() - 1);
              setSelectedDate(format(d, "yyyy-MM-dd"));
            }} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <input type="date" value={selectedDate} max={format(new Date(), "yyyy-MM-dd")}
                onChange={e => setSelectedDate(e.target.value)}
                className="text-sm text-gray-700 dark:text-gray-300 bg-transparent border-none outline-none cursor-pointer" />
            </div>
            <button onClick={() => {
              const d = new Date(selectedDate + "T12:00:00");
              d.setDate(d.getDate() + 1);
              if (d <= new Date()) setSelectedDate(format(d, "yyyy-MM-dd"));
            }} className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors">
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{pct}%</p>
          <p className="text-xs text-gray-500">{completedCount}/{total} clients done</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? "bg-green-500" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }} />
      </div>

      {pct === 100 && total > 0 && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4 text-center">
          <p className="text-green-400 font-semibold">🎉 All check-ins complete for today!</p>
        </div>
      )}

      {loading ? (
        <div className="h-64 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
      ) : amUsers.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No account managers found.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-5">
          {/* AM Selector */}
          <div>
            <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">
              <Users className="w-3.5 h-3.5 inline mr-1" /> Account Manager
            </label>
            <div className="relative">
              <select value={selectedAm} onChange={e => setSelectedAm(e.target.value)}
                className="appearance-none w-full text-sm pl-3 pr-8 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
                {amUsers.map(am => (
                  <option key={am.email} value={am.email}>
                    {am.name}{am.email === user?.email ? " (You)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            </div>
            {selectedAm && selectedAm !== user?.email && (
              <p className="text-[11px] text-orange-500 mt-1">⚠️ Submitting on behalf of {amUsers.find(a => a.email === selectedAm)?.name || selectedAm}</p>
            )}
          </div>

          {/* Client Selector */}
          {myClients.length === 0 ? (
            <div className="text-center py-6 text-gray-400 text-sm">No active clients for this AM.</div>
          ) : (
            <>
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">Account / Client</label>
                <div className="relative">
                  <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)}
                    className="appearance-none w-full text-sm pl-3 pr-8 py-2.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
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
                    <p className="text-xs text-gray-500">
                      {selectedClient.package_type || "No package"} · Group {selectedClient.group || "—"}
                      {selectedClient.revenue ? ` · $${selectedClient.revenue.toLocaleString()}/mo` : ""}
                    </p>
                  </div>
                  <button onClick={() => navigate(createPageUrl(`ClientDetail?id=${selectedClientId}`))}
                    className="flex items-center gap-1 text-xs text-blue-500 hover:text-blue-400 transition-colors">
                    <ExternalLink className="w-3 h-3" /> View
                  </button>
                </div>
              )}

              {/* Daily target info banner */}
              {dailyEmailTarget && (
                <div className="bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded-lg px-3 py-2 flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-500 shrink-0" />
                  <p className="text-xs text-blue-700 dark:text-blue-400">
                    Daily email target: <span className="font-bold">{dailyEmailTarget.toLocaleString()}</span> emails/day
                    (based on {(selectedClient.monthly_sends_target || 0).toLocaleString()}/month ÷ 22 working days)
                  </p>
                </div>
              )}

              {/* Validation errors */}
              {validationErrors.length > 0 && (
                <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg px-3 py-2">
                  {validationErrors.map((err, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> {err}
                    </p>
                  ))}
                </div>
              )}

              {/* Metrics Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">InMails Sent</label>
                  <input type="number" min="0" className={inputCls} placeholder="0"
                    value={form.inmails_sent}
                    onChange={e => { setForm(f => ({ ...f, inmails_sent: e.target.value })); setSaved(false); }} />
                </div>
                <div>
                  <label className="text-xs font-medium text-red-500 dark:text-red-400 block mb-1.5">
                    Emails Sent *
                    {dailyEmailTarget && (
                      <span className="ml-1 font-normal text-gray-400">(target: {dailyEmailTarget.toLocaleString()})</span>
                    )}
                  </label>
                  <input type="number" min="0" className={`${inputCls} ${form.emails_sent === "" ? "border-red-300 dark:border-red-500/50" : ""}`}
                    placeholder="Required"
                    value={form.emails_sent}
                    onChange={e => { setForm(f => ({ ...f, emails_sent: e.target.value })); setSaved(false); setValidationErrors([]); }} />
                </div>
                <div>
                  <label className="text-xs font-medium text-red-500 dark:text-red-400 block mb-1.5">Leads Yesterday *</label>
                  <input type="number" min="0" className={`${inputCls} ${form.leads_generated === "" ? "border-red-300 dark:border-red-500/50" : ""}`}
                    placeholder="Required"
                    value={form.leads_generated}
                    onChange={e => { setForm(f => ({ ...f, leads_generated: e.target.value })); setSaved(false); setValidationErrors([]); }} />
                </div>
              </div>

              {/* Satisfaction Rate */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-2">
                  Satisfaction Rate
                  {form.satisfaction_rate !== "" && (
                    <span className={`ml-2 font-semibold ${
                      Number(form.satisfaction_rate) <= 3 ? "text-red-500" : Number(form.satisfaction_rate) <= 6 ? "text-yellow-500" : "text-green-500"
                    }`}>{form.satisfaction_rate}/10</span>
                  )}
                </label>
                <SatisfactionPicker />
              </div>

              {/* KPI Status */}
              {(() => {
                const leadsThisWeek = (selectedClient?.leads_this_week || 0) + (form.leads_generated !== "" ? Number(form.leads_generated) : 0);
                const kpiMin = selectedClient?.target_leads_per_week || 5;
                const belowKpi = leadsThisWeek < kpiMin;
                return (
                  <div className={`rounded-lg p-3 border ${belowKpi ? "bg-red-50 dark:bg-red-500/10 border-red-200 dark:border-red-500/30" : "bg-green-50 dark:bg-green-500/10 border-green-200 dark:border-green-500/30"}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{belowKpi ? "🔴" : "🟢"}</span>
                        <span className={`text-sm font-semibold ${belowKpi ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                          {belowKpi ? "Below KPI — task will auto-create" : "Above KPI"}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">{leadsThisWeek} / {kpiMin} leads this week</span>
                    </div>
                  </div>
                );
              })()}

              {/* Notes */}
              <div>
                <label className="text-xs font-medium text-gray-500 dark:text-gray-400 block mb-1.5">
                  Notes / Reason for Being Below KPI
                </label>
                <textarea className={inputCls + " h-24 resize-none"}
                  placeholder="If below KPI, explain why. Any blockers, updates, or context..."
                  value={form.notes}
                  onChange={e => { setForm(f => ({ ...f, notes: e.target.value })); setSaved(false); }} />
              </div>

              {/* Save */}
              <div className="flex items-center justify-end pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-2">
                  {saved && <span className="text-xs text-green-400 font-medium">Saved ✓</span>}
                  <button onClick={handleSave} disabled={saving}
                    className="flex items-center gap-1.5 text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50">
                    <Save className="w-3.5 h-3.5" />
                    {saving ? "Saving…" : "Save Check-In"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
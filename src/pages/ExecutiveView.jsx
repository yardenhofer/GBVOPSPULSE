import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { computeRedFlags, computeAutoStatus, STATUS_CONFIG } from "../components/utils/redFlagEngine";
import { format, startOfWeek, subDays, startOfMonth } from "date-fns";
import { DollarSign, TrendingDown, Users, BarChart3, ClipboardCheck, Download, Mail, Calendar } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ExecutiveView() {
  const [clients, setClients] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [digestSent, setDigestSent] = useState(false);
  const [amWindow, setAmWindow] = useState("7"); // "7", "30", "60", "mtd"

  useEffect(() => {
    async function load() {
      const cl = await base44.entities.Client.list("-updated_date", 200);
      setClients(cl);
      setLoading(false);
    }
    load();
  }, []);

  // Load check-ins whenever the window changes
  useEffect(() => {
    async function loadCheckIns() {
      const now = new Date();
      let startDate;
      if (amWindow === "mtd") {
        startDate = startOfMonth(now);
      } else {
        startDate = subDays(now, parseInt(amWindow));
      }
      const startStr = format(startDate, "yyyy-MM-dd");
      // Fetch all check-ins and filter by date >= startStr
      const all = await base44.entities.DailyCheckIn.list("-date", 2000);
      const filtered = all.filter(ci => ci.date >= startStr);
      setCheckIns(filtered);
    }
    loadCheckIns();
  }, [amWindow]);

  // Compute stats
  const withStatus = clients.map(c => ({ ...c, _status: computeAutoStatus(c), _flags: computeRedFlags(c) }));
  const critical = withStatus.filter(c => c._status === "Critical");
  const atRisk = withStatus.filter(c => c._status === "At Risk");
  const revenueAtRisk = [...critical, ...atRisk].reduce((s, c) => s + (c.revenue || 0), 0);

  const avgLeads = clients.length > 0
    ? Math.round(clients.reduce((s, c) => s + (c.leads_this_week || 0), 0) / clients.length)
    : 0;

  const declining = clients.filter(c =>
    c.target_leads_per_week > 0 &&
    (c.leads_this_week || 0) < (c.leads_last_week || 0) &&
    (c.leads_this_week || 0) < c.target_leads_per_week
  );

  // AM performance — check-in % = completed check-ins / (clients × days in window)
  const now = new Date();
  let windowStartDate;
  if (amWindow === "mtd") {
    windowStartDate = startOfMonth(now);
  } else {
    windowStartDate = subDays(now, parseInt(amWindow));
  }
  // Count weekdays (Mon-Fri) in the window as expected check-in days
  const windowDays = (() => {
    let count = 0;
    const d = new Date(windowStartDate);
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    while (d <= today) {
      const day = d.getDay();
      if (day !== 0 && day !== 6) count++;
      d.setDate(d.getDate() + 1);
    }
    return Math.max(count, 1);
  })();

  const amMap = {};
  clients.forEach(c => {
    if (!c.assigned_am) return;
    if (!amMap[c.assigned_am]) amMap[c.assigned_am] = { email: c.assigned_am, clients: [], totalCheckins: 0, doneCheckins: 0 };
    amMap[c.assigned_am].clients.push(c);
  });
  checkIns.forEach(ci => {
    if (amMap[ci.am_email]) {
      amMap[ci.am_email].totalCheckins++;
      if (ci.completed) amMap[ci.am_email].doneCheckins++;
    }
  });
  const amList = Object.values(amMap).map(am => {
    const healthy = am.clients.filter(c => computeAutoStatus(c) === "Healthy").length;
    const expectedCheckins = am.clients.length * windowDays;
    const checkInPct = expectedCheckins > 0 ? Math.min(100, Math.round((am.doneCheckins / expectedCheckins) * 100)) : 0;
    const healthScore = am.clients.length > 0 ? Math.round((healthy / am.clients.length) * 100) : 0;
    const score = Math.round((checkInPct + healthScore) / 2);
    return { ...am, score, checkInPct, healthScore, doneCheckins: am.doneCheckins, expectedCheckins };
  }).sort((a, b) => b.score - a.score);

  async function handleExportPdf() {
    setExportingPdf(true);
    const { data } = await base44.functions.invoke('weeklyReport');
    const blob = new Blob([data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ops-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    setExportingPdf(false);
  }

  async function handleSendDigest() {
    setSendingDigest(true);
    await base44.functions.invoke('dailyDigest');
    setSendingDigest(false);
    setDigestSent(true);
    setTimeout(() => setDigestSent(false), 3000);
  }

  if (loading) {
    return <div className="space-y-4">{Array(5).fill(0).map((_, i) => <div key={i} className="h-28 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Executive View</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{format(new Date(), "EEEE, MMMM d, yyyy")}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSendDigest}
            disabled={sendingDigest || digestSent}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors border
              ${digestSent ? 'border-green-500/30 bg-green-500/10 text-green-400' : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800'}`}
          >
            <Mail className={`w-4 h-4 ${sendingDigest ? 'animate-pulse' : ''}`} />
            {digestSent ? 'Digest Sent!' : sendingDigest ? 'Sending…' : 'Send Digest'}
          </button>
          <button
            onClick={handleExportPdf}
            disabled={exportingPdf}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Download className={`w-4 h-4 ${exportingPdf ? 'animate-spin' : ''}`} />
            {exportingPdf ? 'Generating…' : 'Export PDF'}
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Revenue at Risk", value: `$${revenueAtRisk.toLocaleString()}`, icon: DollarSign, color: "text-red-400", bg: "bg-red-500/10" },
          { label: "Avg Leads / Client", value: avgLeads, icon: BarChart3, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Declining Trend", value: declining.length, icon: TrendingDown, color: "text-orange-400", bg: "bg-orange-500/10" },
          { label: "Critical Clients", value: critical.length, icon: Users, color: "text-red-400", bg: "bg-red-500/10" },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
              <Icon className={`w-5 h-5 ${color}`} />
            </div>
            <div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* AM Performance */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-4 h-4 text-blue-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">AM Performance</h2>
          </div>
          <Select value={amWindow} onValueChange={setAmWindow}>
            <SelectTrigger className="w-[130px] h-8 text-xs">
              <Calendar className="w-3 h-3 mr-1 opacity-50" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="mtd">Month to date</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {amList.length === 0 ? (
          <p className="text-sm text-gray-500">No AMs assigned to clients yet.</p>
        ) : (
          <div className="space-y-3">
            {amList.map(am => (
              <div key={am.email} className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center shrink-0">
                  <span className="text-xs font-bold text-blue-400">{am.email[0].toUpperCase()}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{am.email}</p>
                    <span className={`text-sm font-bold ml-2 ${am.score >= 80 ? "text-green-400" : am.score >= 50 ? "text-yellow-400" : "text-red-400"}`}>
                      {am.score}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${am.score >= 80 ? "bg-green-500" : am.score >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                      style={{ width: `${am.score}%` }}
                    />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {am.clients.length} clients · {am.checkInPct}% check-in · {am.healthScore}% healthy
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Declining clients */}
      {declining.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown className="w-4 h-4 text-orange-400" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Clients with Declining Trends</h2>
          </div>
          <div className="space-y-2">
            {declining.map(c => {
              const drop = c.leads_last_week > 0
                ? Math.round(((c.leads_this_week - c.leads_last_week) / c.leads_last_week) * 100)
                : null;
              return (
                <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">{c.name}</p>
                    <p className="text-xs text-gray-500">{c.assigned_am || "No AM"}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-red-400">{c.leads_this_week ?? "—"} leads</p>
                    {drop !== null && <p className="text-xs text-red-400">{drop}% vs last week</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Leadership review list - Critical clients */}
      {critical.length > 0 && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-red-500/20 p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <h2 className="font-semibold text-gray-900 dark:text-white">Weekly Leadership Review</h2>
          </div>
          <div className="space-y-2">
            {critical.map(c => (
              <div key={c.id} className="flex items-center justify-between py-2 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.name}</p>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c._flags.map((f, i) => (
                      <span key={i} className="text-xs bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">{f.emoji} {f.message}</span>
                    ))}
                  </div>
                </div>
                <div className="text-right text-xs text-gray-500">
                  {c.revenue ? `$${c.revenue.toLocaleString()}/mo` : ""}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
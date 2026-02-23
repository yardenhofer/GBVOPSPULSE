import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { format } from "date-fns";
import { ClipboardCheck, CheckCircle2, Circle, ExternalLink } from "lucide-react";

const TASKS = [
  { key: "reviewed_lead_performance", label: "Reviewed lead performance" },
  { key: "checked_lead_list_status", label: "Checked lead list status" },
  { key: "confirmed_no_issues", label: "Confirmed no client issues" },
  { key: "logged_touchpoint", label: "Logged touchpoint (if applicable)" },
  { key: "updated_sentiment", label: "Updated sentiment" },
];

function CheckInCard({ client, checkIn, user, today, navigate }) {
  const [checks, setChecks] = useState({
    reviewed_lead_performance: checkIn?.reviewed_lead_performance || false,
    checked_lead_list_status: checkIn?.checked_lead_list_status || false,
    confirmed_no_issues: checkIn?.confirmed_no_issues || false,
    logged_touchpoint: checkIn?.logged_touchpoint || false,
    updated_sentiment: checkIn?.updated_sentiment || false,
  });
  const [checkInId, setCheckInId] = useState(checkIn?.id || null);
  const [saving, setSaving] = useState(false);

  const completedCount = Object.values(checks).filter(Boolean).length;
  const isComplete = completedCount === TASKS.length;

  async function toggle(key) {
    const newChecks = { ...checks, [key]: !checks[key] };
    const allDone = Object.values(newChecks).every(Boolean);
    setChecks(newChecks);
    setSaving(true);
    if (checkInId) {
      await base44.entities.DailyCheckIn.update(checkInId, { ...newChecks, completed: allDone });
    } else {
      const created = await base44.entities.DailyCheckIn.create({
        client_id: client.id,
        am_email: user?.email,
        date: today,
        ...newChecks,
        completed: allDone,
      });
      setCheckInId(created.id);
    }
    setSaving(false);
  }

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border transition-all ${isComplete ? "border-green-500/30" : "border-gray-200 dark:border-gray-800"} p-4`}>
      <div className="flex items-center justify-between mb-3">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 dark:text-white text-sm">{client.name}</p>
            <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
              isComplete ? "bg-green-500/10 text-green-400" : "bg-gray-100 dark:bg-gray-800 text-gray-500"
            }`}>
              {completedCount}/{TASKS.length}
            </span>
            {saving && <span className="text-xs text-gray-400">Saving…</span>}
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{client.package_type || "—"}</p>
        </div>
        <button
          onClick={() => navigate(createPageUrl(`ClientDetail?id=${client.id}`))}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="space-y-1.5">
        {TASKS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => toggle(key)}
            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-left transition-all text-sm
              ${checks[key]
                ? "bg-green-500/10 text-green-400"
                : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
              }`}
          >
            {checks[key]
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <Circle className="w-4 h-4 shrink-0" />
            }
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

export default function DailyCheckIn() {
  const [myClients, setMyClients] = useState([]);
  const [checkIns, setCheckIns] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const today = format(new Date(), "yyyy-MM-dd");

  useEffect(() => {
    async function load() {
      const u = await base44.auth.me().catch(() => null);
      setUser(u);
      if (!u) { setLoading(false); return; }
      const [allClients, ci] = await Promise.all([
        base44.entities.Client.list("-name", 200),
        base44.entities.DailyCheckIn.filter({ am_email: u.email, date: today }),
      ]);
      setMyClients(allClients.filter(c => c.assigned_am === u.email));
      setCheckIns(ci);
      setLoading(false);
    }
    load();
  }, []);

  const completed = checkIns.filter(c => c.completed).length;
  const total = myClients.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

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
        Array(3).fill(0).map((_, i) => <div key={i} className="h-44 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />)
      ) : myClients.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <ClipboardCheck className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No clients assigned to you yet.</p>
          <p className="text-sm mt-1">Ask an admin to assign clients to your email.</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {myClients.map(client => (
            <CheckInCard
              key={client.id}
              client={client}
              checkIn={checkIns.find(c => c.client_id === client.id)}
              user={user}
              today={today}
              navigate={navigate}
            />
          ))}
        </div>
      )}
    </div>
  );
}
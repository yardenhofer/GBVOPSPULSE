import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format, isToday, isYesterday } from "date-fns";
import { Activity, ChevronDown, LogIn, ClipboardCheck, UserCog, FileText, Shield, ListChecks, Settings2 } from "lucide-react";

const ACTION_CONFIG = {
  login:            { label: "Login",           icon: LogIn,          color: "text-blue-400",   bg: "bg-blue-500/10" },
  daily_checkin:    { label: "Daily Check-In",  icon: ClipboardCheck, color: "text-green-400",  bg: "bg-green-500/10" },
  client_update:    { label: "Client Update",   icon: UserCog,        color: "text-purple-400", bg: "bg-purple-500/10" },
  activity_logged:  { label: "Activity Logged", icon: FileText,       color: "text-cyan-400",   bg: "bg-cyan-500/10" },
  recovery_plan:    { label: "Recovery Plan",   icon: Shield,         color: "text-red-400",    bg: "bg-red-500/10" },
  lead_list_update: { label: "Lead List",       icon: ListChecks,     color: "text-yellow-400", bg: "bg-yellow-500/10" },
  settings_change:  { label: "Settings Change", icon: Settings2,      color: "text-orange-400", bg: "bg-orange-500/10" },
};

function SummaryCard({ label, value, color }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${color || "text-gray-900 dark:text-white"}`}>{value}</p>
    </div>
  );
}

export default function ActivityLogSection() {
  const [activities, setActivities] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterUser, setFilterUser] = useState("all");
  const [filterAction, setFilterAction] = useState("all");

  useEffect(() => {
    async function load() {
      const [a, usersRes] = await Promise.all([
        base44.entities.UserActivity.list("-created_date", 200),
        base44.functions.invoke("listUsers", {}).then(r => r.data.users || []).catch(() => []),
      ]);
      setActivities(a);
      setUsers(usersRes);
      setLoading(false);
    }
    load();
  }, []);

  const userMap = {};
  users.forEach(u => { userMap[u.email] = u.full_name || u.email; });
  const uniqueEmails = [...new Set(activities.map(a => a.user_email).filter(Boolean))];

  const filtered = activities
    .filter(a => filterUser === "all" || a.user_email === filterUser)
    .filter(a => filterAction === "all" || a.action === filterAction);

  const groups = {};
  filtered.forEach(a => {
    const d = a.created_date ? format(new Date(a.created_date), "yyyy-MM-dd") : "unknown";
    if (!groups[d]) groups[d] = [];
    groups[d].push(a);
  });
  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  function dateLabel(dateStr) {
    if (dateStr === "unknown") return "Unknown";
    const d = new Date(dateStr + "T12:00:00");
    if (isToday(d)) return "Today";
    if (isYesterday(d)) return "Yesterday";
    return format(d, "EEEE, MMM d");
  }

  const todayStr = format(new Date(), "yyyy-MM-dd");
  const todayActivities = activities.filter(a => a.created_date && format(new Date(a.created_date), "yyyy-MM-dd") === todayStr);
  const todayLogins = todayActivities.filter(a => a.action === "login").length;
  const todayCheckIns = todayActivities.filter(a => a.action === "daily_checkin").length;
  const todayTotal = todayActivities.length;

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative">
          <select value={filterUser} onChange={e => setFilterUser(e.target.value)}
            className="appearance-none text-sm pl-3 pr-8 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
            <option value="all">All Users</option>
            {uniqueEmails.map(email => (
              <option key={email} value={email}>{userMap[email] || email}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        </div>
        <div className="relative">
          <select value={filterAction} onChange={e => setFilterAction(e.target.value)}
            className="appearance-none text-sm pl-3 pr-8 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer">
            <option value="all">All Actions</option>
            {Object.entries(ACTION_CONFIG).map(([key, { label }]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCard label="Today's Logins" value={todayLogins} color="text-blue-400" />
        <SummaryCard label="Check-Ins" value={todayCheckIns} color="text-green-400" />
        <SummaryCard label="Total Actions" value={todayTotal} />
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-14 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p className="text-sm">No activity found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {sortedDates.map(dateStr => (
            <div key={dateStr}>
              <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{dateLabel(dateStr)}</h3>
              <div className="bg-gray-50 dark:bg-gray-800/40 rounded-lg divide-y divide-gray-100 dark:divide-gray-800">
                {groups[dateStr].map(a => {
                  const cfg = ACTION_CONFIG[a.action] || ACTION_CONFIG.login;
                  const Icon = cfg.icon;
                  return (
                    <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className={`w-7 h-7 rounded-lg ${cfg.bg} flex items-center justify-center shrink-0`}>
                        <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {a.user_name || userMap[a.user_email] || a.user_email}
                          </span>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color}`}>{cfg.label}</span>
                          {a.client_name && <span className="text-xs text-gray-400">• {a.client_name}</span>}
                        </div>
                        {a.detail && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">{a.detail}</p>}
                      </div>
                      <span className="text-xs text-gray-400 shrink-0">
                        {a.created_date ? format(new Date(a.created_date), "h:mm a") : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format, subDays } from "date-fns";
import { ClipboardList, ChevronDown, Check, X, Mail, MessageSquare, Send, ThumbsUp, ChevronLeft, ChevronRight } from "lucide-react";

const CHECKLIST_KEYS = [
  { key: "reviewed_lead_performance", short: "Leads" },
  { key: "checked_lead_list_status", short: "List" },
  { key: "confirmed_no_issues", short: "Issues" },
  { key: "logged_touchpoint", short: "Touch" },
  { key: "updated_sentiment", short: "Sent." },
];

export default function DailyEntries() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [checkIns, setCheckIns] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAm, setFilterAm] = useState("all");

  useEffect(() => {
    Promise.all([
      base44.entities.Client.list("-name", 200),
      base44.functions.invoke("listUsers", {}).then(res => res.data.users || []),
    ]).then(([c, u]) => {
      setClients(c);
      setUsers(u);
    });
  }, []);

  useEffect(() => {
    setLoading(true);
    base44.entities.DailyCheckIn.filter({ date }).then(ci => {
      setCheckIns(ci);
      setLoading(false);
    });
  }, [date]);

  const clientMap = {};
  clients.forEach(c => { clientMap[c.id] = c; });

  const userMap = {};
  users.forEach(u => { userMap[u.email] = u.full_name || u.email; });

  // Get unique AMs who have clients
  const amEmails = [...new Set(clients.map(c => c.assigned_am).filter(Boolean))];

  // Build rows: all clients with assigned AMs, merged with check-in data
  const rows = clients
    .filter(c => c.assigned_am)
    .filter(c => filterAm === "all" || c.assigned_am === filterAm)
    .map(c => {
      const ci = checkIns.find(x => x.client_id === c.id);
      return { client: c, checkIn: ci || null };
    })
    .sort((a, b) => {
      // Sort: incomplete first, then by AM, then client name
      const aComplete = a.checkIn?.completed ? 1 : 0;
      const bComplete = b.checkIn?.completed ? 1 : 0;
      if (aComplete !== bComplete) return aComplete - bComplete;
      if (a.client.assigned_am !== b.client.assigned_am) return (a.client.assigned_am || "").localeCompare(b.client.assigned_am || "");
      return a.client.name.localeCompare(b.client.name);
    });

  const totalClients = rows.length;
  const completedCount = rows.filter(r => r.checkIn?.completed).length;
  const submittedCount = rows.filter(r => r.checkIn).length;
  const pct = totalClients > 0 ? Math.round((completedCount / totalClients) * 100) : 0;

  function shiftDate(days) {
    setDate(format(subDays(new Date(date + "T12:00:00"), -days), "yyyy-MM-dd"));
  }

  const BoolBadge = ({ value }) => (
    value
      ? <Check className="w-3.5 h-3.5 text-green-400" />
      : <X className="w-3.5 h-3.5 text-gray-300 dark:text-gray-600" />
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Daily Entries</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Admin overview of all daily check-ins</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Date nav */}
          <div className="flex items-center gap-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg px-1">
            <button onClick={() => shiftDate(-1)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors">
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="text-sm bg-transparent text-gray-900 dark:text-gray-100 border-0 focus:outline-none px-1 py-1.5"
            />
            <button onClick={() => shiftDate(1)} className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-800 rounded transition-colors">
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          {/* AM filter */}
          <div className="relative">
            <select
              value={filterAm}
              onChange={e => setFilterAm(e.target.value)}
              className="appearance-none text-sm pl-3 pr-8 py-2 rounded-lg bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
            >
              <option value="all">All AMs</option>
              {amEmails.map(email => (
                <option key={email} value={email}>{userMap[email] || email}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <SummaryCard label="Total Clients" value={totalClients} />
        <SummaryCard label="Submitted" value={submittedCount} sub={`of ${totalClients}`} />
        <SummaryCard label="Completed" value={completedCount} sub={`of ${totalClients}`} color={completedCount === totalClients && totalClients > 0 ? "text-green-400" : undefined} />
        <SummaryCard label="Completion" value={`${pct}%`} color={pct === 100 ? "text-green-400" : pct >= 50 ? "text-blue-400" : "text-orange-400"} />
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-gray-200 dark:bg-gray-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-500 ${pct === 100 ? "bg-green-500" : "bg-blue-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4].map(i => <div key={i} className="h-12 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No clients with assigned AMs found.</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 text-xs text-gray-500 dark:text-gray-400">
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Client</th>
                  <th className="text-left px-4 py-3 font-medium">AM</th>
                  <th className="text-center px-3 py-3 font-medium"><Mail className="w-3.5 h-3.5 mx-auto" /></th>
                  <th className="text-center px-3 py-3 font-medium"><MessageSquare className="w-3.5 h-3.5 mx-auto" /></th>
                  <th className="text-center px-3 py-3 font-medium"><Send className="w-3.5 h-3.5 mx-auto" /></th>
                  <th className="text-center px-3 py-3 font-medium"><ThumbsUp className="w-3.5 h-3.5 mx-auto" /></th>
                  {CHECKLIST_KEYS.map(({ key, short }) => (
                    <th key={key} className="text-center px-2 py-3 font-medium whitespace-nowrap">{short}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ client, checkIn }) => (
                  <tr key={client.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-gray-50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-2.5">
                      {checkIn?.completed ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full">
                          <Check className="w-3 h-3" /> Done
                        </span>
                      ) : checkIn ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full">
                          Partial
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400 bg-gray-500/10 px-2 py-0.5 rounded-full">
                          Missing
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5 font-medium text-gray-900 dark:text-white whitespace-nowrap">
                      {client.name}
                      <span className="text-xs text-gray-400 ml-1.5">{client.package_type}</span>
                    </td>
                    <td className="px-4 py-2.5 text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {userMap[client.assigned_am] || client.assigned_am}
                    </td>
                    <td className="text-center px-3 py-2.5 text-gray-900 dark:text-gray-100">
                      {checkIn ? checkIn.emails_sent : "—"}
                    </td>
                    <td className="text-center px-3 py-2.5 text-gray-900 dark:text-gray-100">
                      {(client.package_type === "Hybrid" || client.package_type === "LinkedIn") ? (checkIn ? checkIn.linkedin_messages_sent : "—") : <span className="text-gray-300 dark:text-gray-600">n/a</span>}
                    </td>
                    <td className="text-center px-3 py-2.5 text-gray-900 dark:text-gray-100">
                      {(client.package_type === "Hybrid" || client.package_type === "LinkedIn") ? (checkIn ? (checkIn.inmails_sent || 0) : "—") : <span className="text-gray-300 dark:text-gray-600">n/a</span>}
                    </td>
                    <td className="text-center px-3 py-2.5 text-gray-900 dark:text-gray-100">
                      {checkIn ? checkIn.positive_responses : "—"}
                    </td>
                    {CHECKLIST_KEYS.map(({ key }) => (
                      <td key={key} className="text-center px-2 py-2.5">
                        <BoolBadge value={checkIn?.[key]} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value, sub, color }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color || "text-gray-900 dark:text-white"}`}>
        {value}
        {sub && <span className="text-xs font-normal text-gray-400 ml-1">{sub}</span>}
      </p>
    </div>
  );
}
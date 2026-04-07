import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { format, subDays } from "date-fns";
import { ClipboardList, ChevronDown, ChevronLeft, ChevronRight, LayoutGrid, Table } from "lucide-react";

import OpsMetricCards from "../components/dailyentries/OpsMetricCards";
import KpiAlertsBanner from "../components/dailyentries/KpiAlertsBanner";
import AmPerformanceGrid from "../components/dailyentries/AmPerformanceGrid";
import ClientEntryCards from "../components/dailyentries/ClientEntryCards";

export default function DailyEntries() {
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [checkIns, setCheckIns] = useState([]);
  const [clients, setClients] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterAm, setFilterAm] = useState("all");
  const [viewFilter, setViewFilter] = useState("all"); // all | missing | below_kpi | low_sat

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

  const amEmails = [...new Set(clients.map(c => c.assigned_am).filter(Boolean))];

  const rows = clients
    .filter(c => c.assigned_am && c.status !== "Terminated")
    .filter(c => filterAm === "all" || c.assigned_am === filterAm)
    .map(c => {
      const ci = checkIns.find(x => x.client_id === c.id);
      return { client: c, checkIn: ci || null };
    })
    .sort((a, b) => {
      // Missing first, then below KPI, then by name
      if (!a.checkIn && b.checkIn) return -1;
      if (a.checkIn && !b.checkIn) return 1;
      const aTarget = a.client.target_leads_per_week || 5;
      const bTarget = b.client.target_leads_per_week || 5;
      const aLeads = (a.client.leads_this_week || 0) + (a.checkIn?.leads_generated || 0);
      const bLeads = (b.client.leads_this_week || 0) + (b.checkIn?.leads_generated || 0);
      const aPct = aLeads / aTarget;
      const bPct = bLeads / bTarget;
      if (aPct !== bPct) return aPct - bPct;
      return a.client.name.localeCompare(b.client.name);
    });

  function shiftDate(days) {
    setDate(format(subDays(new Date(date + "T12:00:00"), -days), "yyyy-MM-dd"));
  }

  const isToday = date === format(new Date(), "yyyy-MM-dd");

  // Counts for filter tabs
  const missingCount = rows.filter(r => !r.checkIn).length;
  const belowKpiCount = rows.filter(r => {
    const target = r.client?.target_leads_per_week || 5;
    const leads = (r.client?.leads_this_week || 0) + (r.checkIn?.leads_generated || 0);
    return leads < target;
  }).length;
  const lowSatCount = rows.filter(r => r.checkIn?.satisfaction_rate != null && r.checkIn.satisfaction_rate <= 4).length;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Ops Center — Daily Entries</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Quick-glance operations overview based on AM input
          </p>
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
          {isToday && <span className="text-[10px] font-bold text-blue-500 bg-blue-500/10 px-2 py-1 rounded-full">TODAY</span>}
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

      {loading ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {Array(7).fill(0).map((_, i) => <div key={i} className="h-24 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />)}
          </div>
          <div className="h-16 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {Array(6).fill(0).map((_, i) => <div key={i} className="h-40 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />)}
          </div>
        </div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <ClipboardList className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p>No clients with assigned AMs found.</p>
        </div>
      ) : (
        <>
          {/* Metric Cards */}
          <OpsMetricCards rows={rows} checkIns={checkIns} />

          {/* Alerts Banner */}
          <KpiAlertsBanner rows={rows} userMap={userMap} />

          {/* AM Performance */}
          <AmPerformanceGrid rows={rows} userMap={userMap} />

          {/* View Filter Tabs */}
          <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
            <FilterTab active={viewFilter === "all"} onClick={() => setViewFilter("all")} label="All Clients" count={rows.length} />
            <FilterTab active={viewFilter === "missing"} onClick={() => setViewFilter("missing")} label="Missing Entry" count={missingCount} color="text-red-500" badgeColor="bg-red-500" />
            <FilterTab active={viewFilter === "below_kpi"} onClick={() => setViewFilter("below_kpi")} label="Below KPI" count={belowKpiCount} color="text-orange-500" badgeColor="bg-orange-500" />
            <FilterTab active={viewFilter === "low_sat"} onClick={() => setViewFilter("low_sat")} label="Low Satisfaction" count={lowSatCount} color="text-yellow-500" badgeColor="bg-yellow-500" />
          </div>

          {/* Client Cards */}
          <ClientEntryCards rows={rows} userMap={userMap} filter={viewFilter} />
        </>
      )}
    </div>
  );
}

function FilterTab({ active, onClick, label, count, color, badgeColor }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
        active
          ? `${color || "text-blue-600"} border-current`
          : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
      }`}
    >
      {label}
      {count > 0 && (
        <span className={`${active ? (badgeColor || "bg-blue-500") : "bg-gray-400"} text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1`}>
          {count}
        </span>
      )}
    </button>
  );
}
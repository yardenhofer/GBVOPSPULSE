import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Plus } from "lucide-react";
import { differenceInDays } from "date-fns";

import SummaryBar from "../components/dashboard/SummaryBar";
import ClientFilters from "../components/dashboard/ClientFilters";
import ClientRow from "../components/dashboard/ClientRow";
import ClientTableHeader from "../components/dashboard/ClientTableHeader";
import { computeRedFlags, computeAutoStatus } from "../components/utils/redFlagEngine";

function getCachedInstantlyResult(client) {
  if (!client.instantly_api_key) return null;
  if (client.instantly_cache_error) return { error: client.instantly_cache_error };
  if (client.instantly_cache_updated) {
    return {
      pct: client.instantly_cache_pct ?? 0,
      noActive: client.instantly_cache_no_active || false,
    };
  }
  return null; // not yet synced
}

const DEFAULT_FILTERS = { search: "", sort: "risk", package: "All", status: "All", group: "All", sequence: "All" };

const STATUS_ORDER = { Critical: 0, "At Risk": 1, Monitor: 2, Healthy: 3, "Off-Boarding": 4 };

export default function Dashboard() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("all"); // "all" | "escalated" | "awaiting_leads"
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      loadClients(u);
    }).catch(() => {});
  }, []);

  async function loadClients(currentUser) {
    const u = currentUser || user;
    setLoading(true);
    let data;
    if (u?.role === 'admin') {
      data = await base44.entities.Client.list("-updated_date", 200);
    } else {
      data = await base44.entities.Client.filter({ assigned_am: u?.email }, "-updated_date", 200);
    }
    setClients(data);
    setLoading(false);
  }

  const groups = [...new Set(clients.map(c => c.group).filter(g => g != null))].sort((a, b) => a - b);

  const activeClients = clients.filter(c => c.status !== "Terminated" && c.status !== "Off-Boarding");
  const offboardingClients = clients.filter(c => c.status === "Off-Boarding");
  const terminatedClients = clients.filter(c => c.status === "Terminated");
  const escalatedClients = activeClients.filter(c => c.is_escalated);
  const awaitingLeadsClients = activeClients.filter(c => c.waiting_on_leads);

  const filtered = clients
    .filter(c => {
      if (activeTab === "archived") return c.status === "Terminated";
      if (activeTab === "offboarding") return c.status === "Off-Boarding";
      if (c.status === "Terminated" || c.status === "Off-Boarding") return false;
      if (activeTab === "escalated") return c.is_escalated;
      if (activeTab === "awaiting_leads") return c.waiting_on_leads;
      if (filters.search && !c.name.toLowerCase().includes(filters.search.toLowerCase()) &&
          !(c.assigned_am || "").toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.package !== "All" && c.package_type !== filters.package) return false;
      const status = computeAutoStatus(c);
      if (filters.status !== "All" && status !== filters.status) return false;
      if (filters.group !== "All" && String(c.group) !== filters.group) return false;
      if (filters.sequence && filters.sequence !== "All") {
        const ir = getCachedInstantlyResult(c);
        const pct = ir?.pct;
        if (filters.sequence === "red" && !(pct != null && pct >= 80)) return false;
        if (filters.sequence === "orange" && !(pct != null && pct >= 60 && pct < 80)) return false;
        if (filters.sequence === "red_orange" && !(pct != null && pct >= 60)) return false;
        if (filters.sequence === "green" && !(pct != null && pct < 60)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      const sa = computeAutoStatus(a), sb = computeAutoStatus(b);
      if (filters.sort === "risk") return (STATUS_ORDER[sa] ?? 4) - (STATUS_ORDER[sb] ?? 4);
      if (filters.sort === "am") return (a.assigned_am || "").localeCompare(b.assigned_am || "");
      if (filters.sort === "leads_drop") {
        const da = (a.target_leads_per_week || 1) > 0
          ? (a.leads_this_week || 0) / a.target_leads_per_week : 1;
        const db = (b.target_leads_per_week || 1) > 0
          ? (b.leads_this_week || 0) / b.target_leads_per_week : 1;
        return da - db;
      }
      return a.name.localeCompare(b.name);
    });

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Client Dashboard</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">Live operational status</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={loadClients}
            className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => navigate(createPageUrl("ClientDetail"))}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            <Plus className="w-4 h-4" /> Add Client
          </button>
        </div>
      </div>

      {/* Summary */}
      <SummaryBar clients={activeClients} computeAutoStatus={computeAutoStatus} />

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-800">
        <button
          onClick={() => setActiveTab("all")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "all"
              ? "border-blue-600 text-blue-600"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
          }`}
        >
          All Clients
        </button>
        <button
          onClick={() => setActiveTab("escalated")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "escalated"
              ? "border-red-500 text-red-500"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
          }`}
        >
          🚨 Escalated
          {escalatedClients.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {escalatedClients.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("awaiting_leads")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "awaiting_leads"
              ? "border-orange-500 text-orange-500"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
          }`}
        >
          ⏳ Awaiting Leads
          {awaitingLeadsClients.length > 0 && (
            <span className="bg-orange-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {awaitingLeadsClients.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("offboarding")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "offboarding"
              ? "border-violet-500 text-violet-500"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
          }`}
        >
          🚪 Off-Boarding
          {offboardingClients.length > 0 && (
            <span className="bg-violet-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {offboardingClients.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("archived")}
          className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            activeTab === "archived"
              ? "border-red-500 text-red-500"
              : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
          }`}
        >
          📦 Archived
          {terminatedClients.length > 0 && (
            <span className="bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {terminatedClients.length}
            </span>
          )}
        </button>
      </div>

      {/* Filters (only in all tab) */}
      {activeTab === "all" && <ClientFilters filters={filters} onFiltersChange={setFilters} groups={groups} />}

      {/* Awaiting Leads info banner */}
      {activeTab === "awaiting_leads" && (
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl px-4 py-3 text-sm text-orange-600 dark:text-orange-400">
          ⏳ These clients have <strong>"Waiting on Leads"</strong> enabled on their profile. Review and follow up on lead list status.
        </div>
      )}

      {/* Table header */}
      <ClientTableHeader />

      {/* Clients */}
      <div className="space-y-2">
        {loading ? (
          Array(5).fill(0).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
          ))
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            {clients.length === 0 ? "No clients yet. Add your first client." : "No clients match these filters."}
          </div>
        ) : filtered.map(c => (
          <ClientRow
            key={c.id}
            client={c}
            flags={computeRedFlags(c)}
            status={computeAutoStatus(c)}
            isOwn={user?.email === c.assigned_am}
            onClick={() => navigate(createPageUrl(`ClientDetail?id=${c.id}`))}
            instantlyResult={getCachedInstantlyResult(c)}
          />
        ))}
      </div>
    </div>
  );
}
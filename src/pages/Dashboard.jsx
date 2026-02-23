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

const DEFAULT_FILTERS = { search: "", sort: "risk", package: "All", status: "All", group: "All" };

const STATUS_ORDER = { Critical: 0, "At Risk": 1, Monitor: 2, Healthy: 3 };

export default function Dashboard() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
    loadClients();
  }, []);

  async function loadClients() {
    setLoading(true);
    const data = await base44.entities.Client.list("-updated_date", 200);
    setClients(data);
    setLoading(false);
  }

  const groups = [...new Set(clients.map(c => c.group).filter(g => g != null))].sort((a, b) => a - b);

  const filtered = clients
    .filter(c => {
      if (filters.search && !c.name.toLowerCase().includes(filters.search.toLowerCase()) &&
          !(c.assigned_am || "").toLowerCase().includes(filters.search.toLowerCase())) return false;
      if (filters.package !== "All" && c.package_type !== filters.package) return false;
      const status = computeAutoStatus(c);
      if (filters.status !== "All" && status !== filters.status) return false;
      if (filters.group !== "All" && String(c.group) !== filters.group) return false;
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
      <SummaryBar clients={clients} computeAutoStatus={computeAutoStatus} />

      {/* Filters */}
      <ClientFilters filters={filters} onFiltersChange={setFilters} groups={groups} />

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
          />
        ))}
      </div>
    </div>
  );
}
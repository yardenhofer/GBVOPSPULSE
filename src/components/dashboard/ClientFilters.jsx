import { Search, SlidersHorizontal } from "lucide-react";

const SORT_OPTIONS = [
  { value: "risk", label: "Risk Level" },
  { value: "am", label: "Account Manager" },
  { value: "leads_drop", label: "Lead Volume Drop" },
  { value: "name", label: "Client Name" },
];

const PACKAGE_OPTIONS = ["All", "PPL", "Retainer", "Hybrid"];
const STATUS_OPTIONS = ["All", "Healthy", "Monitor", "At Risk", "Critical"];

export default function ClientFilters({ filters, onFiltersChange, groups = [] }) {
  const groupOptions = ["All", ...groups.map(String)];
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-3 flex flex-wrap gap-2 items-center">
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          placeholder="Search clients..."
          value={filters.search}
          onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
          className="w-full pl-8 pr-3 py-1.5 rounded-lg text-sm bg-gray-100 dark:bg-gray-800 border-0 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 shrink-0">
        <SlidersHorizontal className="w-3.5 h-3.5" />
        <span>Sort:</span>
      </div>
      <select
        value={filters.sort}
        onChange={e => onFiltersChange({ ...filters, sort: e.target.value })}
        className="text-sm py-1.5 px-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>

      <select
        value={filters.package}
        onChange={e => onFiltersChange({ ...filters, package: e.target.value })}
        className="text-sm py-1.5 px-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {PACKAGE_OPTIONS.map(o => <option key={o} value={o}>{o === "All" ? "All Packages" : o}</option>)}
      </select>

      <select
        value={filters.status}
        onChange={e => onFiltersChange({ ...filters, status: e.target.value })}
        className="text-sm py-1.5 px-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o === "All" ? "All Statuses" : o}</option>)}
      </select>
    </div>
  );
}
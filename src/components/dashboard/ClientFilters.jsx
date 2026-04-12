import { Search, ChevronDown, ArrowUpDown } from "lucide-react";

const SORT_OPTIONS = [
  { value: "sentiment", label: "Sentiment" },
  { value: "risk", label: "Risk Level" },
  { value: "am", label: "Account Manager" },
  { value: "leads_drop", label: "Lead Volume Drop" },
  { value: "name", label: "Client Name" },
];

const PACKAGE_OPTIONS = [
  { value: "All", label: "All Packages" },
  { value: "Email", label: "Email" },
  { value: "LinkedIn", label: "LinkedIn" },
  { value: "Hybrid", label: "Hybrid" },
];

const STATUS_OPTIONS = [
  { value: "All", label: "All Statuses" },
  { value: "Healthy", label: "Healthy" },
  { value: "Monitor", label: "Monitor" },
  { value: "At Risk", label: "At Risk" },
  { value: "Critical", label: "Critical" },
];

const SEQUENCE_OPTIONS = [
  { value: "All", label: "All Sequence %" },
  { value: "red", label: "🔴 High (≥80%)" },
  { value: "orange", label: "🟠 Medium (60-79%)" },
  { value: "red_orange", label: "🔴🟠 Needs Lists (≥60%)" },
  { value: "green", label: "🟢 Healthy (<60%)" },
];

function FilterPill({ value, options, onChange, icon: Icon }) {
  const selected = options.find(o => o.value === value) || options[0];
  const isDefault = value === options[0].value;

  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="appearance-none cursor-pointer pl-3 pr-7 py-1.5 rounded-full text-xs font-medium border transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500
          bg-white dark:bg-gray-900
          border-gray-200 dark:border-gray-700
          text-gray-700 dark:text-gray-200
          hover:border-gray-300 dark:hover:border-gray-600
          hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400" />
    </div>
  );
}

export default function ClientFilters({ filters, onFiltersChange, groups = [] }) {
  const groupOptions = [
    { value: "All", label: "All Groups" },
    ...groups.map(g => ({ value: String(g), label: `Group ${g}` })),
  ];

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-[180px]">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
        <input
          type="text"
          placeholder="Search clients..."
          value={filters.search}
          onChange={e => onFiltersChange({ ...filters, search: e.target.value })}
          className="w-full pl-8 pr-3 py-1.5 rounded-full text-xs bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors hover:border-gray-300 dark:hover:border-gray-600"
        />
      </div>

      {/* Sort */}
      <div className="flex items-center gap-1.5">
        <ArrowUpDown className="w-3 h-3 text-gray-400 shrink-0" />
        <FilterPill
          value={filters.sort}
          options={SORT_OPTIONS}
          onChange={v => onFiltersChange({ ...filters, sort: v })}
        />
      </div>

      {/* Package */}
      <FilterPill
        value={filters.package}
        options={PACKAGE_OPTIONS}
        onChange={v => onFiltersChange({ ...filters, package: v })}
      />

      {/* Status */}
      <FilterPill
        value={filters.status}
        options={STATUS_OPTIONS}
        onChange={v => onFiltersChange({ ...filters, status: v })}
      />

      {/* Sequence % */}
      <FilterPill
        value={filters.sequence || "All"}
        options={SEQUENCE_OPTIONS}
        onChange={v => onFiltersChange({ ...filters, sequence: v })}
      />

      {/* Group */}
      {groupOptions.length > 1 && (
        <FilterPill
          value={filters.group || "All"}
          options={groupOptions}
          onChange={v => onFiltersChange({ ...filters, group: v })}
        />
      )}
    </div>
  );
}
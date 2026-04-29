import { useState, useMemo, useEffect } from "react";
import { ChevronDown, ChevronRight, Check, Users, Globe, FileSpreadsheet, Filter } from "lucide-react";
import { base44 } from "@/api/base44Client";

function groupByDomain(clients) {
  const groups = {};
  for (const client of clients) {
    const domain = (client.domain || "").toLowerCase().trim() || "unknown";
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(client);
  }
  return Object.entries(groups)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

function groupByBatch(clients, importLogs) {
  const nameToLogMap = {};
  for (const log of importLogs) {
    const names = (log.company_names || "").split(",").map(n => n.trim().toLowerCase()).filter(Boolean);
    for (const name of names) {
      nameToLogMap[name] = log;
    }
  }

  const groups = {};
  const unmatched = [];
  for (const client of clients) {
    const cName = (client.companyName || "").toLowerCase().trim();
    const log = nameToLogMap[cName];
    if (log) {
      const key = log.id;
      if (!groups[key]) groups[key] = { label: log.file_name || `Import ${log.created_date?.substring(0, 10)}`, date: log.created_date, clients: [] };
      groups[key].clients.push(client);
    } else {
      unmatched.push(client);
    }
  }

  const sorted = Object.entries(groups)
    .sort((a, b) => (b[1].date || "").localeCompare(a[1].date || ""))
    .map(([key, val]) => [val.label, val.clients]);

  if (unmatched.length > 0) {
    sorted.push(["Ungrouped (no import batch)", unmatched]);
  }
  return sorted;
}

export default function ClientGroupSelector({ eligible, selectedIds, onSelectionChange }) {
  const [expandedGroups, setExpandedGroups] = useState({});
  const [search, setSearch] = useState("");
  const [groupMode, setGroupMode] = useState("domain"); // "domain" or "batch"
  const [importLogs, setImportLogs] = useState([]);
  const [batchFilter, setBatchFilter] = useState("all"); // "all" or a log id

  useEffect(() => {
    base44.entities.CsvImportLog.list("-created_date", 50).then(setImportLogs).catch(() => {});
  }, []);

  // Apply batch filter first
  const batchFiltered = useMemo(() => {
    if (batchFilter === "all" || groupMode !== "batch") return eligible;
    const log = importLogs.find(l => l.id === batchFilter);
    if (!log) return eligible;
    const names = new Set((log.company_names || "").split(",").map(n => n.trim().toLowerCase()).filter(Boolean));
    return eligible.filter(c => names.has((c.companyName || "").toLowerCase().trim()));
  }, [eligible, batchFilter, groupMode, importLogs]);

  const groups = useMemo(() => {
    if (groupMode === "batch") return groupByBatch(batchFiltered, importLogs);
    return groupByDomain(batchFiltered);
  }, [batchFiltered, groupMode, importLogs]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map(([label, clients]) => {
        const matchingClients = clients.filter(
          c => c.companyName.toLowerCase().includes(q) || label.toLowerCase().includes(q)
        );
        return matchingClients.length > 0 ? [label, matchingClients] : null;
      })
      .filter(Boolean);
  }, [groups, search]);

  function toggleGroup(domain, clients) {
    const clientIds = clients.map(c => c.companyId);
    const allSelected = clientIds.every(id => selectedIds.has(id));
    const next = new Set(selectedIds);
    if (allSelected) {
      clientIds.forEach(id => next.delete(id));
    } else {
      clientIds.forEach(id => next.add(id));
    }
    onSelectionChange(next);
  }

  function toggleClient(companyId) {
    const next = new Set(selectedIds);
    if (next.has(companyId)) {
      next.delete(companyId);
    } else {
      next.add(companyId);
    }
    onSelectionChange(next);
  }

  function selectAll() {
    onSelectionChange(new Set(eligible.map(c => c.companyId)));
  }

  function selectNone() {
    onSelectionChange(new Set());
  }

  function toggleExpanded(domain) {
    setExpandedGroups(prev => ({ ...prev, [domain]: !prev[domain] }));
  }

  // Select all visible (filtered) clients
  function selectAllVisible() {
    const visibleIds = batchFiltered.map(c => c.companyId);
    const next = new Set(selectedIds);
    visibleIds.forEach(id => next.add(id));
    onSelectionChange(next);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Select Clients</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {selectedIds.size} of {eligible.length} selected · {filteredGroups.length} group{filteredGroups.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {batchFilter !== "all" && (
            <button onClick={selectAllVisible} className="text-xs px-2 py-1 rounded-md bg-green-50 dark:bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-500/20 font-medium">
              Select Batch
            </button>
          )}
          <button onClick={selectAll} className="text-xs px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 font-medium">
            Select All
          </button>
          <button onClick={selectNone} className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium">
            Clear
          </button>
        </div>
      </div>

      {/* Group mode toggle + batch filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 gap-0.5">
          <button
            onClick={() => { setGroupMode("domain"); setBatchFilter("all"); }}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              groupMode === "domain" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <Globe className="w-3 h-3" /> Domain
          </button>
          <button
            onClick={() => setGroupMode("batch")}
            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
              groupMode === "batch" ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            <FileSpreadsheet className="w-3 h-3" /> Import Batch
          </button>
        </div>

        {groupMode === "batch" && importLogs.length > 0 && (
          <select
            value={batchFilter}
            onChange={e => setBatchFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="all">All batches</option>
            {importLogs.map(log => (
              <option key={log.id} value={log.id}>
                {log.file_name || `Import ${log.created_date?.substring(0, 10)}`} ({log.success_count || 0} companies)
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder={`Search by client name or ${groupMode === "domain" ? "domain" : "batch"}…`}
        value={search}
        onChange={e => setSearch(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Groups */}
      <div className="max-h-80 overflow-y-auto space-y-1">
        {filteredGroups.map(([domain, clients]) => {
          const clientIds = clients.map(c => c.companyId);
          const selectedCount = clientIds.filter(id => selectedIds.has(id)).length;
          const allSelected = selectedCount === clients.length;
          const someSelected = selectedCount > 0 && !allSelected;
          const expanded = expandedGroups[domain];

          return (
            <div key={domain} className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden">
              {/* Group header */}
              <div
                className="flex items-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-800/50 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                onClick={() => toggleExpanded(domain)}
              >
                {expanded ? <ChevronDown className="w-3 h-3 text-gray-400 shrink-0" /> : <ChevronRight className="w-3 h-3 text-gray-400 shrink-0" />}

                {/* Group checkbox */}
                <button
                  onClick={e => { e.stopPropagation(); toggleGroup(domain, clients); }}
                  className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors
                    ${allSelected ? "bg-blue-600 border-blue-600" : someSelected ? "bg-blue-200 dark:bg-blue-500/30 border-blue-400" : "border-gray-300 dark:border-gray-600"}`}
                >
                  {allSelected && <Check className="w-3 h-3 text-white" />}
                  {someSelected && <div className="w-2 h-0.5 bg-blue-600 dark:bg-blue-400 rounded" />}
                </button>

                {groupMode === "batch" ? <FileSpreadsheet className="w-3 h-3 text-purple-400 shrink-0" /> : <Globe className="w-3 h-3 text-gray-400 shrink-0" />}
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300 truncate">{domain}</span>
                <span className="ml-auto text-xs text-gray-400 shrink-0">
                  {selectedCount}/{clients.length}
                </span>
              </div>

              {/* Individual clients */}
              {expanded && (
                <div className="divide-y divide-gray-100 dark:divide-gray-800">
                  {clients.map(client => {
                    const selected = selectedIds.has(client.companyId);
                    return (
                      <div
                        key={client.companyId}
                        onClick={() => toggleClient(client.companyId)}
                        className="flex items-center gap-2 px-3 py-1.5 pl-10 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/30"
                      >
                        <button
                          className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors
                            ${selected ? "bg-blue-600 border-blue-600" : "border-gray-300 dark:border-gray-600"}`}
                        >
                          {selected && <Check className="w-3 h-3 text-white" />}
                        </button>
                        <span className="text-xs text-gray-700 dark:text-gray-300 truncate">{client.companyName}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {filteredGroups.length === 0 && (
          <p className="text-xs text-gray-400 text-center py-4">No clients match your search.</p>
        )}
      </div>
    </div>
  );
}
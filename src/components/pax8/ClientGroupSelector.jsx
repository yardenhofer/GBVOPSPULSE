import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight, Check, Users, Globe } from "lucide-react";

function groupByDomain(clients) {
  const groups = {};
  for (const client of clients) {
    const domain = (client.domain || "").toLowerCase().trim() || "unknown";
    if (!groups[domain]) groups[domain] = [];
    groups[domain].push(client);
  }
  // Sort groups by size descending, then alphabetically
  return Object.entries(groups)
    .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
}

export default function ClientGroupSelector({ eligible, selectedIds, onSelectionChange }) {
  const [expandedGroups, setExpandedGroups] = useState({});
  const [search, setSearch] = useState("");

  const groups = useMemo(() => groupByDomain(eligible), [eligible]);

  const filteredGroups = useMemo(() => {
    if (!search.trim()) return groups;
    const q = search.toLowerCase();
    return groups
      .map(([domain, clients]) => {
        const matchingClients = clients.filter(
          c => c.companyName.toLowerCase().includes(q) || domain.includes(q)
        );
        return matchingClients.length > 0 ? [domain, matchingClients] : null;
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

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Select Clients</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            {selectedIds.size} of {eligible.length} selected · {filteredGroups.length} domain group{filteredGroups.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={selectAll} className="text-xs px-2 py-1 rounded-md bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 font-medium">
            Select All
          </button>
          <button onClick={selectNone} className="text-xs px-2 py-1 rounded-md bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium">
            Clear
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        placeholder="Search by client name or domain…"
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

                <Globe className="w-3 h-3 text-gray-400 shrink-0" />
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
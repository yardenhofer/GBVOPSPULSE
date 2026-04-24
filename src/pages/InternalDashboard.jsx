import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Linkedin, AlertTriangle, ChevronDown, ChevronRight, Users, BarChart3, Mail, Link2, ChevronLeft, Calendar, MessageSquare } from "lucide-react";
import OutreachChart from "@/components/internaldashboard/OutreachChart";
import InMailLeaderboard from "@/components/internaldashboard/InMailLeaderboard";
import DisconnectedAccountsBanner from "@/components/internaldashboard/DisconnectedAccountsBanner";

const PERIOD_OPTIONS = [
  { label: "Today", days: 1 },
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "60 days", days: 60 },
  { label: "90 days", days: 90 },
];

function PctBar({ pct }) {
  if (pct == null) return <span className="text-gray-400">—</span>;
  const color = pct >= 80 ? "bg-red-500" : pct >= 60 ? "bg-orange-500" : "bg-green-500";
  const text = pct >= 80 ? "text-red-500" : pct >= 60 ? "text-orange-500" : "text-green-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
        <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className={`text-xs font-semibold ${text}`}>{pct}%</span>
    </div>
  );
}

function WorkspaceCard({ workspace, days }) {
  const [expanded, setExpanded] = useState(true);
  const { client_name, accounts = [], campaigns = [], chartData = [], summary, error } = workspace;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
      >
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-gray-900 dark:text-white truncate">{client_name}</h3>
          {error ? (
            <div className="flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-3 h-3 text-amber-500" />
              <span className="text-xs text-amber-500">{error}</span>
            </div>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {summary?.total_accounts ?? 0} senders · {summary?.active_campaigns ?? 0} active campaigns
            </p>
          )}
        </div>

        {!error && summary && (
          <div className="hidden md:flex items-center gap-6 text-xs mr-4">
            <div className="text-center">
              <p className="text-gray-400">InMails Sent</p>
              <p className="font-bold text-emerald-500">{(summary.total_inmails || 0).toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400">Connections Sent</p>
              <p className="font-bold text-indigo-500">{(summary.total_connections || 0).toLocaleString()}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-400">In Progress</p>
              <p className="font-bold text-amber-500">{(summary.total_in_progress || 0).toLocaleString()}</p>
            </div>
            <div className="w-28">
              <p className="text-gray-400 mb-0.5">Completion</p>
              {summary.active_campaigns === 0
                ? <span className="text-gray-400 text-[10px]">No active</span>
                : <PctBar pct={summary.completion_pct} />
              }
            </div>
          </div>
        )}

        {expanded ? <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" /> : <ChevronRight className="w-4 h-4 text-gray-400 shrink-0" />}
      </button>

      {expanded && !error && (
        <div className="border-t border-gray-100 dark:border-gray-800 p-4 space-y-6">
          {/* Outreach activity — chart + leaderboard */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Daily Outreach (last {days}d)</h4>
              <OutreachChart chartData={chartData} />
            </div>
            {/* Leaderboard */}
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Per Sender Activity</h4>
              <InMailLeaderboard accounts={accounts} days={days} />
            </div>
          </div>

          {/* Per-sender campaign progress */}
          {accounts.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Campaign Progress by Sender</h4>
              <div className="space-y-2">
                {accounts.filter(a => a.total_leads > 0).map(acc => (
                  <div key={acc.id} className="flex items-center gap-3 text-xs">
                    <span className="w-28 truncate font-medium text-gray-700 dark:text-gray-300">{acc.name}</span>
                    <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2.5 overflow-hidden">
                      <div
                        className={`h-full rounded-full ${
                          acc.completion_pct >= 80 ? 'bg-red-500' : acc.completion_pct >= 60 ? 'bg-orange-500' : 'bg-green-500'
                        }`}
                        style={{ width: `${Math.min(100, acc.completion_pct)}%` }}
                      />
                    </div>
                    <span className={`w-10 text-right font-semibold ${
                      acc.completion_pct >= 80 ? 'text-red-500' : acc.completion_pct >= 60 ? 'text-orange-500' : 'text-green-500'
                    }`}>{acc.completion_pct}%</span>
                    <span className="text-gray-400 w-48 hidden sm:inline">
                      {acc.finished_leads.toLocaleString()} done · {acc.in_progress.toLocaleString()} active · {acc.total_leads.toLocaleString()} total
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Active Campaigns list */}
          {campaigns.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2">Active Campaigns ({campaigns.length})</h4>
              <div className="space-y-1">
                {campaigns.map(camp => (
                  <div key={camp.id} className="flex items-center justify-between text-xs py-1 px-2 rounded bg-gray-50 dark:bg-gray-800/50">
                    <span className="font-medium text-gray-700 dark:text-gray-300 truncate">{camp.name}</span>
                    <span className="text-gray-400 shrink-0 ml-2">
                      {camp.finished_leads.toLocaleString()} finished · {camp.in_progress.toLocaleString()} active · {camp.total_leads.toLocaleString()} total
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {accounts.length === 0 && campaigns.length === 0 && (
            <p className="text-xs text-gray-400 italic text-center py-4">No active campaigns found.</p>
          )}
        </div>
      )}
    </div>
  );
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

export default function InternalDashboard() {
  const [workspaces, setWorkspaces] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [days, setDays] = useState(1);
  const [syncing, setSyncing] = useState(false);
  const [specificDate, setSpecificDate] = useState(null);

  async function loadFromDB(d) {
    const records = await base44.entities.HeyReachCache.filter({ days: d });
    if (!records || records.length === 0) return false;

    // Separate main workspace records from account chunks
    const mainRecords = [];
    const accountChunks = [];
    for (const r of records) {
      if (!r.workspace_data) continue;
      const parsed = JSON.parse(r.workspace_data);
      if (parsed._type === "accounts_chunk") {
        accountChunks.push(parsed);
      } else {
        mainRecords.push(parsed);
      }
    }

    // Merge account chunks into their parent workspace
    for (const ws of mainRecords) {
      const chunks = accountChunks.filter(c => c.parent_client_id === ws.client_id);
      if (chunks.length > 0) {
        const mergedAccounts = [];
        for (const chunk of chunks) {
          mergedAccounts.push(...(chunk.accounts || []));
        }
        ws.accounts = mergedAccounts;
        ws.summary = ws.summary || {};
        ws.summary.total_accounts = mergedAccounts.length;
      }
    }

    mainRecords.sort((a, b) => (a.client_name || '').localeCompare(b.client_name || ''));

    const syncedAt = records[0].synced_at ? new Date(records[0].synced_at) : new Date(records[0].updated_date);
    setWorkspaces(mainRecords);
    setLastUpdated(syncedAt);
    return true;
  }

  async function loadForDate(dateStr) {
    setLoading(true);
    setError(null);
    const startDate = new Date(dateStr + 'T00:00:00.000Z').toISOString();
    const endDate = new Date(dateStr + 'T23:59:59.999Z').toISOString();
    try {
      const resp = await base44.functions.invoke('heyReachAccountStats', { days: 1, startDate, endDate });
      const ws = (resp.data?.workspaces || []).sort((a, b) => {
        if (a.client_id === '__internal__') return -1;
        if (b.client_id === '__internal__') return 1;
        return (a.client_name || '').localeCompare(b.client_name || '');
      });
      setWorkspaces(ws);
      setLastUpdated(new Date());
    } catch (err) {
      setError("Failed to load data for that date: " + (err?.message || err));
    }
    setLoading(false);
  }

  async function load(d) {
    setLoading(true);
    setError(null);
    const hit = await loadFromDB(d);
    if (!hit) setError("No data cached yet — the background sync runs every 30 minutes. Please check back shortly.");
    setLoading(false);
  }

  async function refresh() {
    setSyncing(true);
    if (specificDate) {
      await loadForDate(specificDate);
    } else {
      await load(days);
    }
    setSyncing(false);
  }

  useEffect(() => {
    load(days);
  }, []);

  async function handlePeriodChange(d) {
    setSpecificDate(null);
    setDays(d);
    setLoading(true);
    setError(null);
    const hit = await loadFromDB(d);
    if (!hit) setError(`No data cached for ${d}d period yet.`);
    setLoading(false);
  }

  function handleDateNav(direction) {
    const base = specificDate || todayStr();
    const d = new Date(base + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + direction);
    const next = d.toISOString().split('T')[0];
    if (next > todayStr()) return;
    setSpecificDate(next);
    setDays(null);
    loadForDate(next);
  }

  function handleTodayClick() {
    if (specificDate) {
      setSpecificDate(todayStr());
      setDays(null);
      loadForDate(todayStr());
    } else {
      handlePeriodChange(1);
    }
  }

  const totalAccounts = workspaces.reduce((s, w) => s + (w.summary?.total_accounts || 0), 0);
  const totalConnections = workspaces.reduce((s, w) => s + (w.summary?.total_connections || 0), 0);
  const totalInmails = workspaces.reduce((s, w) => s + (w.summary?.total_inmails || 0), 0);
  const totalActiveCampaigns = workspaces.reduce((s, w) => s + (w.summary?.active_campaigns || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Linkedin className="w-6 h-6 text-blue-600" /> Internal Dashboard
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            LinkedIn campaign status across all HeyReach workspaces
            {syncing && <span className="ml-2 text-blue-500"> · Syncing from HeyReach…</span>}
            {!syncing && lastUpdated && <span className="ml-2"> · Last synced {lastUpdated.toLocaleTimeString()}</span>}
          </p>
        </div>
      </div>

      {/* Period filter */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          {PERIOD_OPTIONS.map(opt => (
            <button
              key={opt.days}
              onClick={() => handlePeriodChange(opt.days)}
              disabled={loading}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                !specificDate && days === opt.days
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Specific date navigator */}
        <div className="flex items-center gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
          <button
            onClick={() => handleDateNav(-1)}
            disabled={loading}
            className="p-1 rounded-md text-gray-500 hover:text-gray-800 dark:hover:text-white hover:bg-white dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
            title="Previous day"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div className="relative">
            <Calendar className="w-3.5 h-3.5 text-gray-400 absolute left-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="date"
              value={specificDate || ""}
              max={todayStr()}
              onChange={(e) => {
                if (!e.target.value) return;
                setSpecificDate(e.target.value);
                setDays(null);
                loadForDate(e.target.value);
              }}
              className={`pl-6 pr-2 py-1 rounded-md text-xs font-medium bg-transparent border-0 outline-none cursor-pointer transition-colors
                ${specificDate
                  ? "text-violet-600 dark:text-violet-400 bg-white dark:bg-gray-700"
                  : "text-gray-500 dark:text-gray-400"
                }`}
              style={{ colorScheme: 'dark' }}
            />
          </div>

          <button
            onClick={() => handleDateNav(1)}
            disabled={loading || specificDate === todayStr() || !specificDate}
            className="p-1 rounded-md text-gray-500 hover:text-gray-800 dark:hover:text-white hover:bg-white dark:hover:bg-gray-700 transition-colors disabled:opacity-40"
            title="Next day"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={refresh}
          disabled={syncing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Loading…" : "Reload"}
        </button>
      </div>

      {/* Disconnected accounts alert */}
      <DisconnectedAccountsBanner />

      {/* Summary stats */}
      {!loading && workspaces.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "LinkedIn Senders", value: totalAccounts, icon: Users, color: "text-blue-500", bg: "bg-blue-500/10" },
            { label: "Active Campaigns", value: totalActiveCampaigns, icon: BarChart3, color: "text-violet-500", bg: "bg-violet-500/10" },
            { label: `InMails Sent`, value: totalInmails.toLocaleString(), icon: Mail, color: "text-emerald-500", bg: "bg-emerald-500/10" },
            { label: `Connections Sent`, value: totalConnections.toLocaleString(), icon: Link2, color: "text-indigo-500", bg: "bg-indigo-500/10" },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-center gap-2 mb-1">
                <div className={`p-1.5 rounded-lg ${bg}`}><Icon className={`w-4 h-4 ${color}`} /></div>
              </div>
              <p className="text-xl font-bold text-gray-900 dark:text-white">{value}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="space-y-4">
          {Array(2).fill(0).map((_, i) => (
            <div key={i} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4" />
              <div className="h-40 bg-gray-100 dark:bg-gray-800 rounded" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-6 text-center">
          <AlertTriangle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
          <p className="text-sm text-amber-700 dark:text-amber-300">{error}</p>
        </div>
      ) : workspaces.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 text-center">
          <Linkedin className="w-10 h-10 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">No HeyReach workspaces configured.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {workspaces.map(w => (
            <WorkspaceCard key={w.client_id} workspace={w} days={specificDate ? 1 : days} />
          ))}
        </div>
      )}
    </div>
  );
}
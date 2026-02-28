import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Mail, MousePointerClick, MessageSquare, Users, Calendar, Zap } from "lucide-react";

const TIME_FILTERS = [
  { label: 'Day', value: 'day' },
  { label: 'Week', value: 'week' },
  { label: 'Month', value: 'month' },
];

export default function InstantlyStatsPanel({ client }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeFilter, setTimeFilter] = useState('month');

  async function fetchStats(period) {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('instantlySync', { client_id: client.id, time_filter: period || timeFilter });
      if (res.data.error) throw new Error(res.data.error);
      setStats(res.data.stats);
    } catch (e) {
      setError(e.message || 'Failed to fetch Instantly data');
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchStats();
  }, [client.id, timeFilter]);

  // For lead consumption: each active campaign shows its own breakdown
  // leads_count = total leads in campaign pool
  // completed_count = leads that finished the entire sequence  
  // The API doesn't directly give "not yet contacted" but we can show per-campaign data
  const activeCampaigns = stats?.campaigns?.filter(c => c.status === 'active') || [];
  const activeCampaign = activeCampaigns.length === 1 ? activeCampaigns[0] : null;

  const metrics = stats ? [
    { label: 'Sent', value: stats.total_sent.toLocaleString(), icon: Mail, color: 'text-blue-400', bg: 'bg-blue-500/10' },
    { label: 'Opens', value: `${stats.total_opens.toLocaleString()} (${stats.open_rate}%)`, icon: MousePointerClick, color: 'text-purple-400', bg: 'bg-purple-500/10' },
    { label: 'Replies', value: `${stats.total_replies.toLocaleString()} (${stats.reply_rate}%)`, icon: MessageSquare, color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
    { label: 'Opportunities', value: stats.total_opportunities.toLocaleString(), icon: Users, color: 'text-green-400', bg: 'bg-green-500/10' },
    { label: 'Bounced', value: stats.total_bounced.toLocaleString(), icon: Calendar, color: 'text-red-400', bg: 'bg-red-500/10' },
  ] : [];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Zap className="w-4 h-4 text-orange-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Instantly Live Stats</h3>
          {stats && (
            <span className="text-xs text-gray-400">
              · synced {new Date(stats.last_synced).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5">
            {TIME_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setTimeFilter(f.value)}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  timeFilter === f.value
                    ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchStats()}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-400 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Syncing…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && (
        <div className="text-xs text-red-400 bg-red-500/10 rounded-lg px-3 py-2">{error}</div>
      )}

      {loading && !stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      )}

      {stats && (
        <div className="mb-4">
          {activeCampaigns.map(c => {
           // Sequence started = emails_sent (first step only would be ideal, but we use sent as proxy)
           // completed_count matches Instantly's "Completed" exactly
           // The remaining leads still in sequence = leads_count - completed_count
           const remaining = c.leads_count - c.completed_count;
           const completedPct = c.leads_count > 0 ? Math.round((c.completed_count / c.leads_count) * 100) : 0;
           // For the progress bar, show how much of the lead pool has been sent to (contacted_count / leads_count, capped at 100%)
           const sentRatio = c.leads_count > 0 ? Math.min(100, Math.round((c.sent / c.leads_count) * 100)) : 0;
           return (
             <div key={c.id} className="mb-3">
               <div className="flex items-center justify-between mb-1">
                 <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                   {c.name}
                 </span>
                 <span className="text-xs text-gray-400">
                   {c.leads_count.toLocaleString()} total leads
                 </span>
               </div>
               <div className="grid grid-cols-2 gap-2 text-center mb-2">
                 <div className="rounded-lg bg-yellow-500/10 px-2 py-1.5">
                   <p className="text-xs text-gray-500 dark:text-gray-400">In Sequence</p>
                   <p className="text-sm font-semibold text-yellow-400">{Math.max(0, remaining).toLocaleString()}</p>
                 </div>
                 <div className="rounded-lg bg-green-500/10 px-2 py-1.5">
                   <p className="text-xs text-gray-500 dark:text-gray-400">Completed</p>
                   <p className="text-sm font-semibold text-green-400">{c.completed_count.toLocaleString()}</p>
                 </div>
               </div>
               <div className="flex items-center justify-between mb-1">
                 <span className="text-xs text-gray-500 dark:text-gray-400">Sequence Completion</span>
                 <span className={`text-xs font-semibold ${completedPct >= 80 ? 'text-red-400' : completedPct >= 60 ? 'text-orange-400' : 'text-green-400'}`}>
                   {completedPct}% completed
                 </span>
               </div>
               <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
                 <div
                   className="h-2 rounded-full transition-all bg-blue-400"
                   style={{ width: `${Math.min(100, completedPct)}%` }}
                 />
               </div>
             </div>
           );
          })}
          {activeCampaigns.length === 0 && (
            <p className="text-xs text-gray-400">No active campaigns found</p>
          )}
        </div>
      )}

      {stats && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {metrics.map(({ label, value, icon: Icon, color, bg }) => (
              <div key={label} className={`rounded-lg ${bg} px-3 py-3`}>
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className={`w-3.5 h-3.5 ${color}`} />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{label}</span>
                </div>
                <p className={`text-sm font-semibold ${color}`}>{value}</p>
              </div>
            ))}
          </div>

          {stats.campaigns?.length > 0 && (
            <div className="mt-4">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                {stats.active_only ? `Active Campaigns (${stats.campaigns_count})` : `All Campaigns (${stats.total_campaigns})`}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {stats.campaigns.map(c => (
                  <span key={c.id} className={`text-xs px-2 py-0.5 rounded-full font-medium
                    ${c.status === 'active' ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>
                    {c.name}
                  </span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
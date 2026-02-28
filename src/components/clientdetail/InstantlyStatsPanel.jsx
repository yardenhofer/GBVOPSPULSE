import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Mail, MousePointerClick, MessageSquare, Users, Calendar, Zap } from "lucide-react";

export default function InstantlyStatsPanel({ client }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function fetchStats() {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke('instantlySync', { client_id: client.id });
      if (res.data.error) throw new Error(res.data.error);
      setStats(res.data.stats);
    } catch (e) {
      setError(e.message || 'Failed to fetch Instantly data');
    }
    setLoading(false);
  }

  useEffect(() => {
    fetchStats();
  }, [client.id]);

  const leadListPct = (stats && stats.total_leads > 0)
    ? Math.min(100, Math.round((stats.total_contacted / stats.total_leads) * 100))
    : null;

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
        <button
          onClick={fetchStats}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-blue-400 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Syncing…' : 'Refresh'}
        </button>
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
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500 dark:text-gray-400">
            Lead List Consumption {stats.active_only ? '(active campaign)' : '(all campaigns)'}
          </span>
            {leadListPct !== null ? (
              <span className={`text-xs font-semibold ${leadListPct >= 80 ? 'text-orange-400' : leadListPct >= 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                {leadListPct}% contacted ({stats.total_contacted.toLocaleString()} / {stats.total_leads.toLocaleString()} leads)
              </span>
            ) : (
              <span className="text-xs text-gray-400">No lead count data</span>
            )}
          </div>
          <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden">
            {leadListPct !== null && (
              <div
                className={`h-2 rounded-full transition-all ${leadListPct >= 80 ? 'bg-orange-400' : leadListPct >= 60 ? 'bg-yellow-400' : 'bg-green-400'}`}
                style={{ width: `${leadListPct}%` }}
              />
            )}
          </div>
          {leadListPct >= 80 && (
            <p className="text-xs text-orange-400 mt-1">⚠️ Lead list nearly exhausted — ensure next list is ready</p>
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
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Active Campaigns ({stats.campaigns_count})</p>
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
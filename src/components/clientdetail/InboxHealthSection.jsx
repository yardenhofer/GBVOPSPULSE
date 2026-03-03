import { AlertTriangle, CheckCircle, XCircle, Pause, Inbox } from "lucide-react";

const STATUS_STYLES = {
  Active: { icon: CheckCircle, color: "text-green-400", bg: "bg-green-500/10" },
  Paused: { icon: Pause, color: "text-gray-400", bg: "bg-gray-500/10" },
  Maintenance: { icon: Pause, color: "text-blue-400", bg: "bg-blue-500/10" },
  "Connection Error": { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  "Soft Bounce Error": { icon: AlertTriangle, color: "text-orange-400", bg: "bg-orange-500/10" },
  "Sending Error": { icon: XCircle, color: "text-red-400", bg: "bg-red-500/10" },
  Unknown: { icon: AlertTriangle, color: "text-gray-400", bg: "bg-gray-500/10" },
};

export default function InboxHealthSection({ inboxHealth }) {
  if (!inboxHealth || inboxHealth.total === 0) return null;

  const { total, active, paused, errors, error_pct, accounts } = inboxHealth;
  const hasAlert = error_pct > 5;
  const errorAccounts = accounts.filter(a => a.status < 0);

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border p-5 ${hasAlert ? 'border-red-500/40' : 'border-gray-200 dark:border-gray-800'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Inbox Health</h3>
        </div>
        {hasAlert && (
          <span className="flex items-center gap-1 text-xs font-medium text-red-400 bg-red-500/10 px-2.5 py-1 rounded-full animate-pulse">
            <AlertTriangle className="w-3 h-3" />
            {error_pct}% infrastructure errors
          </span>
        )}
      </div>

      {/* Summary counters */}
      <div className="grid grid-cols-3 gap-3 mb-4">
        <div className="rounded-lg bg-green-500/10 px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-green-400">{active}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Active</p>
        </div>
        <div className="rounded-lg bg-gray-500/10 px-3 py-2.5 text-center">
          <p className="text-lg font-bold text-gray-400">{paused}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Paused</p>
        </div>
        <div className={`rounded-lg px-3 py-2.5 text-center ${errors > 0 ? 'bg-red-500/10' : 'bg-gray-500/10'}`}>
          <p className={`text-lg font-bold ${errors > 0 ? 'text-red-400' : 'text-gray-400'}`}>{errors}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">Errors</p>
        </div>
      </div>

      {/* Health bar */}
      <div className="w-full h-2 rounded-full bg-gray-100 dark:bg-gray-800 overflow-hidden flex">
        {active > 0 && <div className="h-2 bg-green-400" style={{ width: `${(active / total) * 100}%` }} />}
        {paused > 0 && <div className="h-2 bg-gray-400" style={{ width: `${(paused / total) * 100}%` }} />}
        {errors > 0 && <div className="h-2 bg-red-400" style={{ width: `${(errors / total) * 100}%` }} />}
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{total} total inboxes</p>

      {/* Error accounts list */}
      {errorAccounts.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Accounts with Errors</p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {errorAccounts.map(a => {
              const style = STATUS_STYLES[a.status_label] || STATUS_STYLES.Unknown;
              const Icon = style.icon;
              return (
                <div key={a.email} className="flex items-center gap-2 text-xs bg-red-500/5 border border-red-500/15 rounded-lg px-3 py-2">
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${style.color}`} />
                  <span className="text-gray-700 dark:text-gray-300 truncate flex-1">{a.email}</span>
                  <span className={`font-medium ${style.color} shrink-0`}>{a.status_label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
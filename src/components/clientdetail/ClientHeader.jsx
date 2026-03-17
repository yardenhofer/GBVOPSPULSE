import { useState } from "react";
import { differenceInDays, format } from "date-fns";
import { ArrowLeft, DollarSign, Target, Calendar, MessageCircle, Archive, LogOut, Trash2 } from "lucide-react";
import { STATUS_CONFIG, SENTIMENT_CONFIG } from "../utils/redFlagEngine";

export default function ClientHeader({ client, status, onBack, onDelete, onTerminate, onOffboard }) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [showOffboardConfirm, setShowOffboardConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [terminating, setTerminating] = useState(false);
  const [offboarding, setOffboarding] = useState(false);
  const isTerminated = client.status === 'Terminated';
  const isOffBoarding = client.status === 'Off-Boarding';
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG["Healthy"];
  const sentCfg = SENTIMENT_CONFIG[client.client_sentiment] || SENTIMENT_CONFIG["Neutral"];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const replyDays = client.last_client_reply_date
    ? differenceInDays(today, new Date(client.last_client_reply_date + "T00:00:00"))
    : null;

  const stats = [
    { icon: DollarSign, label: "Monthly Revenue", value: client.revenue ? `$${client.revenue.toLocaleString()}` : "—" },
    { icon: Calendar, label: "Start Date", value: client.start_date ? format(new Date(client.start_date), "MMM d, yyyy") : "—" },
    { icon: Target, label: "Target Leads/wk", value: client.target_leads_per_week ?? "—" },
    { icon: MessageCircle, label: "Last Client Reply", value: replyDays !== null ? `${replyDays}d ago` : "—" },
  ];

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-700 dark:hover:text-white transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">{client.name}</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">{client.assigned_am || "No AM assigned"}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {status}
          </span>
          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full ${sentCfg.bg} ${sentCfg.color}`}>
            {sentCfg.emoji} {client.client_sentiment || "Unknown"}
          </span>
          {onOffboard && !isTerminated && !isOffBoarding && (
            <button
              onClick={() => setShowOffboardConfirm(true)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-violet-500 hover:bg-violet-50 dark:hover:bg-violet-500/10 border border-violet-300 dark:border-violet-500/30 transition-colors"
              title="Start off-boarding"
            >
              <LogOut className="w-3.5 h-3.5" />
              Off-Board
            </button>
          )}
          {onTerminate && !isTerminated && !isOffBoarding && (
            <button
              onClick={() => setShowConfirm(true)}
              className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              title="Terminate client"
            >
              <Archive className="w-4 h-4" />
            </button>
          )}
          {isOffBoarding && (
            <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/20">
              Off-Boarding since {client.offboarding_date || "—"}
            </span>
          )}
          {isTerminated && (
            <>
              <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-gray-500/10 text-gray-400 border border-gray-500/20">
                Terminated {client.terminated_date || ""}
              </span>
              {onDelete && (
                <button
                  onClick={() => { setShowDeleteConfirm(true); setDeletePassword(""); setDeleteError(false); }}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  title="Permanently delete client"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(({ icon: Icon, label, value }) => (
          <div key={label} className="bg-gray-50 dark:bg-gray-800/60 rounded-lg p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Icon className="w-3.5 h-3.5 text-gray-400" />
              <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
            </div>
            <p className="text-sm font-bold text-gray-900 dark:text-white">{value}</p>
          </div>
        ))}
      </div>
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 max-w-sm mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-red-500">Permanently Delete Client</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This will permanently delete <strong>{client.name}</strong> and all associated data. This cannot be undone.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Enter password to confirm</label>
              <input
                type="password"
                value={deletePassword}
                onChange={e => { setDeletePassword(e.target.value); setDeleteError(false); }}
                placeholder="Password"
                className={`w-full px-3 py-2 rounded-lg border ${deleteError ? 'border-red-500' : 'border-gray-300 dark:border-gray-700'} bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 outline-none`}
                autoFocus
              />
              {deleteError && <p className="text-xs text-red-500 mt-1">Incorrect password</p>}
            </div>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (deletePassword !== "1") { setDeleteError(true); return; }
                  setDeleting(true);
                  await onDelete();
                }}
                disabled={deleting}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {deleting ? "Deleting…" : "Delete Forever"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showOffboardConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowOffboardConfirm(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 max-w-md mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Off-Board Client</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This will move <strong>{client.name}</strong> to the Off-Boarding tab and post a checklist to <strong>#client-offboarding</strong> in Slack.
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Daily reminders will be sent until a team member replies <strong>CONFIRMED</strong> in the Slack thread. Once confirmed, the client will be automatically archived.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowOffboardConfirm(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setOffboarding(true);
                  await onOffboard();
                  setShowOffboardConfirm(false);
                  setOffboarding(false);
                }}
                disabled={offboarding}
                className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {offboarding ? "Sending…" : "Start Off-Boarding"}
              </button>
            </div>
          </div>
        </div>
      )}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowConfirm(false)}>
          <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 max-w-sm mx-4 space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white">Terminate Client</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Are you sure you want to terminate <strong>{client.name}</strong>? They will be moved to the Archived tab and hidden from the active dashboard.
            </p>
            <div className="flex items-center gap-3 justify-end">
              <button
                onClick={() => setShowConfirm(false)}
                className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-sm font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  setTerminating(true);
                  await onTerminate();
                }}
                disabled={terminating}
                className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {terminating ? "Terminating…" : "Terminate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
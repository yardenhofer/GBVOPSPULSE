import { useState } from "react";
import { CheckCircle2, XCircle, Clock, Award, DollarSign } from "lucide-react";

const STATUS_STYLES = {
  pending: { bg: "bg-yellow-100 dark:bg-yellow-500/10", text: "text-yellow-700 dark:text-yellow-400", icon: Clock },
  approved: { bg: "bg-green-100 dark:bg-green-500/10", text: "text-green-700 dark:text-green-400", icon: CheckCircle2 },
  denied: { bg: "bg-red-100 dark:bg-red-500/10", text: "text-red-700 dark:text-red-400", icon: XCircle },
};

export default function BonusCard({ bonus, onApprove, onDeny }) {
  const [notes, setNotes] = useState("");
  const [acting, setActing] = useState(false);

  const style = STATUS_STYLES[bonus.status] || STATUS_STYLES.pending;
  const StatusIcon = style.icon;
  const monthLabel = bonus.renewal_month ? `Month ${bonus.renewal_month}` : "Renewal";

  async function handleAction(action) {
    setActing(true);
    if (action === "approve") await onApprove(bonus.id, notes);
    else await onDeny(bonus.id, notes);
    setActing(false);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-yellow-100 dark:bg-yellow-500/10 flex items-center justify-center">
            <Award className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">{bonus.client_name}</h3>
            <p className="text-xs text-gray-500">
              {bonus.min_contract_months && (
                <span>{bonus.min_contract_months}-month contract · </span>
              )}
              {bonus.renewal_due_date && (
                <span>Due {bonus.renewal_due_date}</span>
              )}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 px-2 py-0.5 rounded-full">
            {monthLabel}
          </span>
          <span className={`flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${style.bg} ${style.text}`}>
            <StatusIcon className="w-3 h-3" />
            {bonus.status === "pending" ? "Awaiting Confirmation" : bonus.status}
          </span>
        </div>
      </div>

      {/* Pending = question prompt */}
      {bonus.status === "pending" && (
        <div className="mt-3 bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-lg p-3">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            <DollarSign className="w-4 h-4 inline mr-1" />
            Has {bonus.client_name} paid for {monthLabel.toLowerCase()}?
          </p>
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
            This is month {bonus.renewal_month || "?"} of service — beyond their {bonus.min_contract_months}-month minimum.
            Confirming payment qualifies the AM for a ${bonus.am_bonus_amount} bonus.
          </p>
        </div>
      )}

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
        <div>
          <span className="text-gray-400">AM</span>
          <p className="text-gray-900 dark:text-white font-medium truncate">{bonus.am_email || "—"}</p>
          <p className="text-green-600 font-semibold">${bonus.am_bonus_amount}</p>
        </div>
        <div>
          <span className="text-gray-400">PM</span>
          <p className="text-gray-900 dark:text-white font-medium truncate">{bonus.pm_email || "—"}</p>
          <p className="text-blue-600 font-semibold">${bonus.pm_bonus_amount}</p>
        </div>
        <div>
          <span className="text-gray-400">Detected</span>
          <p className="text-gray-900 dark:text-white font-medium">{bonus.detected_date || "—"}</p>
        </div>
        {bonus.reviewed_by && (
          <div>
            <span className="text-gray-400">Reviewed by</span>
            <p className="text-gray-900 dark:text-white font-medium truncate">{bonus.reviewed_by}</p>
          </div>
        )}
      </div>

      {bonus.admin_notes && (
        <p className="mt-2 text-xs text-gray-500 italic">"{bonus.admin_notes}"</p>
      )}

      {bonus.status === "pending" && (
        <div className="mt-3 space-y-2">
          <input
            type="text"
            placeholder="Optional notes…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full text-xs px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button onClick={() => handleAction("approve")} disabled={acting}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-green-600 text-white hover:bg-green-700 font-medium disabled:opacity-50">
              <CheckCircle2 className="w-3 h-3" /> Yes, Client Paid
            </button>
            <button onClick={() => handleAction("deny")} disabled={acting}
              className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 font-medium disabled:opacity-50">
              <XCircle className="w-3 h-3" /> No, Client Didn't Pay
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
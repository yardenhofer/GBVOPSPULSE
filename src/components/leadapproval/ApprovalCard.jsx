import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, XCircle, Clock, FileText, ExternalLink, Loader2, MessageSquare } from "lucide-react";
import { format } from "date-fns";

const STATUS_STYLES = {
  Pending: { icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20", label: "Pending Review" },
  Approved: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/20", label: "Approved" },
  Denied: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", label: "Denied" },
};

export default function ApprovalCard({ item, isAdmin, user, onUpdated }) {
  const [feedback, setFeedback] = useState("");
  const [acting, setActing] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);

  const cfg = STATUS_STYLES[item.status] || STATUS_STYLES.Pending;
  const StatusIcon = cfg.icon;

  async function handleAction(status) {
    setActing(true);
    await base44.entities.LeadListApproval.update(item.id, {
      status,
      reviewed_by: user.email,
      reviewed_date: new Date().toISOString(),
      admin_feedback: feedback.trim() || null,
    });
    setActing(false);
    setShowFeedback(false);
    setFeedback("");
    onUpdated();
  }

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border ${item.status === "Pending" ? "border-yellow-500/30" : "border-gray-200 dark:border-gray-800"} p-4 space-y-3`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.list_name}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            <span className="font-medium">{item.client_name}</span>
            {" · "}Submitted by {item.submitted_by_name || item.submitted_by}
            {" · "}{format(new Date(item.created_date), "MMM d, yyyy h:mm a")}
          </p>
        </div>
        <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
          <StatusIcon className="w-3 h-3" />
          {cfg.label}
        </span>
      </div>

      {/* Details */}
      <div className="flex flex-wrap gap-3 text-xs">
        {item.list_type === "file" && item.file_url && (
          <a href={item.file_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-500 hover:text-blue-600">
            <FileText className="w-3 h-3" /> Download CSV
          </a>
        )}
        {item.list_type === "link" && item.link_url && (
          <a href={item.link_url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 text-blue-500 hover:text-blue-600">
            <ExternalLink className="w-3 h-3" /> View List
          </a>
        )}
        {item.lead_count && (
          <span className="text-gray-500 dark:text-gray-400">~{item.lead_count} leads</span>
        )}
      </div>

      {/* AM notes */}
      {item.notes && (
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">AM Notes:</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{item.notes}</p>
        </div>
      )}

      {/* Admin feedback (if reviewed) */}
      {item.admin_feedback && item.status !== "Pending" && (
        <div className={`rounded-lg px-3 py-2 ${item.status === "Approved" ? "bg-green-50 dark:bg-green-500/5" : "bg-red-50 dark:bg-red-500/5"}`}>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">
            Admin Feedback ({item.reviewed_by}):
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{item.admin_feedback}</p>
          {item.reviewed_date && (
            <p className="text-xs text-gray-400 mt-1">{format(new Date(item.reviewed_date), "MMM d, yyyy h:mm a")}</p>
          )}
        </div>
      )}

      {/* Admin actions (only for pending items) */}
      {isAdmin && item.status === "Pending" && (
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
          {!showFeedback ? (
            <div className="flex items-center gap-2">
              <button onClick={() => handleAction("Approved")} disabled={acting}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-50">
                {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Approve
              </button>
              <button onClick={() => setShowFeedback(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors">
                <XCircle className="w-3 h-3" /> Deny
              </button>
              <button onClick={() => setShowFeedback(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-xs font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <MessageSquare className="w-3 h-3" /> Add Feedback
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={2}
                placeholder="Provide feedback (required for denial, optional for approval)…"
                className="w-full text-sm px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
              <div className="flex items-center gap-2">
                <button onClick={() => handleAction("Approved")} disabled={acting}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-medium transition-colors disabled:opacity-50">
                  {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />} Approve with Feedback
                </button>
                <button onClick={() => { if (!feedback.trim()) return; handleAction("Denied"); }}
                  disabled={acting || !feedback.trim()}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-medium transition-colors disabled:opacity-50">
                  <XCircle className="w-3 h-3" /> Deny
                </button>
                <button onClick={() => { setShowFeedback(false); setFeedback(""); }}
                  className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, XCircle, Clock, FileText, ExternalLink, Loader2, MessageSquare, Eye, ShieldCheck, AlertTriangle } from "lucide-react";
import CsvPreviewModal from "./CsvPreviewModal";
import AiAnalysisPanel from "./AiAnalysisPanel";
import AiScoreBadge from "./AiScoreBadge";
function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/New_York" }) +
    " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "America/New_York" });
}

const STATUS_STYLES = {
  Pending: { icon: Clock, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20", label: "Pending Review" },
  Approved: { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/20", label: "Approved" },
  Denied: { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20", label: "Denied" },
  "Pending Senior Review": { icon: Clock, color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/20", label: "Awaiting Senior Review" },
};

const SENIOR_REVIEWERS = ["yardenhofer@gmail.com", "ibraheem@growbigventures.com", "leon@growbigventures.com"];

export default function ApprovalCard({ item, isAdmin, user, onUpdated, client }) {
  const [feedback, setFeedback] = useState("");
  const [acting, setActing] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const cfg = STATUS_STYLES[item.status] || STATUS_STYLES.Pending;
  const StatusIcon = cfg.icon;

  const isSeniorReviewer = SENIOR_REVIEWERS.includes(user?.email);

  async function handleAction(status) {
    setActing(true);
    // If approving and this is a first-time client list, route to senior review instead
    if (status === "Approved" && item.requires_senior_approval && !item.senior_approved_by) {
      // Senior reviewers give final approval directly
      if (isSeniorReviewer) {
        await base44.entities.LeadListApproval.update(item.id, {
          status: "Approved",
          reviewed_by: item.reviewed_by || user.email,
          reviewed_date: item.reviewed_date || new Date().toISOString(),
          admin_feedback: item.admin_feedback || feedback.trim() || null,
          senior_approved_by: user.email,
          senior_approved_date: new Date().toISOString(),
          senior_feedback: feedback.trim() || null,
        });
      } else {
        // Regular admin approval → move to senior review
        await base44.entities.LeadListApproval.update(item.id, {
          status: "Pending Senior Review",
          reviewed_by: user.email,
          reviewed_date: new Date().toISOString(),
          admin_feedback: feedback.trim() || null,
        });
      }
    } else if (item.status === "Pending Senior Review" && isSeniorReviewer) {
      // Senior reviewer acting on a pending senior review item
      await base44.entities.LeadListApproval.update(item.id, {
        status,
        senior_approved_by: status === "Approved" ? user.email : null,
        senior_approved_date: status === "Approved" ? new Date().toISOString() : null,
        senior_feedback: feedback.trim() || null,
      });
    } else {
      await base44.entities.LeadListApproval.update(item.id, {
        status,
        reviewed_by: user.email,
        reviewed_date: new Date().toISOString(),
        admin_feedback: feedback.trim() || null,
      });
    }
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
            {" · "}{formatDate(item.created_date)}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0 flex-wrap justify-end">
          {item.requires_senior_approval && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-500 border border-purple-500/20">
              <AlertTriangle className="w-3 h-3" />
              1st Client List
            </span>
          )}
          <AiScoreBadge score={item.ai_score} recommendation={item.ai_recommendation} />
          <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>
            <StatusIcon className="w-3 h-3" />
            {cfg.label}
          </span>
        </div>
      </div>

      {/* Details */}
      <div className="flex flex-wrap gap-3 text-xs">
        {item.list_type === "file" && item.file_url && (
          <>
            <button onClick={() => setShowPreview(true)}
              className="flex items-center gap-1 text-blue-500 hover:text-blue-600 font-medium">
              <Eye className="w-3 h-3" /> Preview CSV
            </button>
            <a href={item.file_url} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 text-gray-500 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-300">
              <FileText className="w-3 h-3" /> Download
            </a>
          </>
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

      {/* Client Copy */}
      {item.client_copy && (
        <details className="bg-orange-50/50 dark:bg-orange-500/5 border border-orange-200/30 dark:border-orange-500/10 rounded-lg">
          <summary className="px-3 py-2 text-xs text-orange-600 dark:text-orange-400 font-medium cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-500/10 rounded-lg transition-colors">
            View Client Copy
          </summary>
          <div className="px-3 pb-2">
            <pre className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap font-sans leading-relaxed">{item.client_copy}</pre>
          </div>
        </details>
      )}

      {/* AM notes */}
      {item.notes && (
        <div className="bg-gray-50 dark:bg-gray-800/60 rounded-lg px-3 py-2">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">AM Notes:</p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{item.notes}</p>
        </div>
      )}

      {/* Admin feedback (if reviewed) */}
      {item.admin_feedback && item.status !== "Pending" && (
        <div className={`rounded-lg px-3 py-2 ${item.status === "Denied" ? "bg-red-50 dark:bg-red-500/5" : "bg-green-50 dark:bg-green-500/5"}`}>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">
            Admin Feedback ({item.reviewed_by}):
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{item.admin_feedback}</p>
          {item.reviewed_date && (
            <p className="text-xs text-gray-400 mt-1">{formatDate(item.reviewed_date)}</p>
          )}
        </div>
      )}

      {/* Senior review info */}
      {item.requires_senior_approval && item.status === "Pending Senior Review" && (
        <div className="rounded-lg px-3 py-2 bg-purple-50 dark:bg-purple-500/5 border border-purple-200 dark:border-purple-500/20">
          <p className="text-xs font-medium text-purple-600 dark:text-purple-400 flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5" />
            First list for this client — requires final sign-off from Yarden or Ibraheem
          </p>
        </div>
      )}

      {/* Senior reviewer feedback (if senior reviewed) */}
      {item.senior_feedback && item.senior_approved_by && (
        <div className="rounded-lg px-3 py-2 bg-purple-50 dark:bg-purple-500/5">
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mb-0.5">
            Senior Review ({item.senior_approved_by}):
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300">{item.senior_feedback}</p>
          {item.senior_approved_date && (
            <p className="text-xs text-gray-400 mt-1">{formatDate(item.senior_approved_date)}</p>
          )}
        </div>
      )}

      {/* AI Analysis */}
      <AiAnalysisPanel item={item} onAnalyzed={onUpdated} />

      {/* Admin actions (for pending items, or pending senior review for senior reviewers) */}
      {isAdmin && (item.status === "Pending" || (item.status === "Pending Senior Review" && isSeniorReviewer)) && (
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
      {/* CSV Preview Modal */}
      {showPreview && item.file_url && (
        <CsvPreviewModal
          fileUrl={item.file_url}
          listName={item.list_name}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}
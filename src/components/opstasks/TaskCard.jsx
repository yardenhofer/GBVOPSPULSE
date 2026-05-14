import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Clock, AlertTriangle, ChevronDown, ChevronUp, Eye, MessageSquare, Loader2 } from "lucide-react";

const PRIORITY_STYLES = {
  critical: { bg: "bg-red-500/10", border: "border-red-500/30", text: "text-red-500", label: "Critical" },
  high: { bg: "bg-orange-500/10", border: "border-orange-500/30", text: "text-orange-500", label: "High" },
  medium: { bg: "bg-yellow-500/10", border: "border-yellow-500/30", text: "text-yellow-500", label: "Medium" },
  low: { bg: "bg-green-500/10", border: "border-green-500/30", text: "text-green-500", label: "Low" },
};

const TASK_TYPE_LABELS = {
  adjust_copy: "Adjust Copy",
  expand_lead_list: "Expand Lead List",
  fix_deliverability: "Fix Deliverability",
  review_targeting: "Review Targeting",
  other: "Other",
};

export default function TaskCard({ task, mode, onUpdated }) {
  const [expanded, setExpanded] = useState(false);
  const [feedback, setFeedback] = useState(task.feedback || "");
  const [acting, setActing] = useState(false);

  const pri = PRIORITY_STYLES[task.priority] || PRIORITY_STYLES.medium;
  const isAssignee = mode === "assignee";
  const isAm = mode === "am";

  async function handleComplete() {
    if (!feedback.trim()) return;
    setActing(true);
    await base44.entities.OpsTask.update(task.id, {
      status: "completed",
      feedback: feedback.trim(),
      completed_at: new Date().toISOString(),
    });
    base44.functions.invoke("notifyTaskComplete", { task_id: task.id }).catch(() => {});
    setActing(false);
    onUpdated();
  }

  async function handleStartProgress() {
    await base44.entities.OpsTask.update(task.id, { status: "in_progress" });
    onUpdated();
  }

  async function handleAmSeen() {
    await base44.entities.OpsTask.update(task.id, {
      am_seen: true,
      am_seen_at: new Date().toISOString(),
    });
    onUpdated();
  }

  async function handleAmRelayed() {
    await base44.entities.OpsTask.update(task.id, {
      am_relayed_to_client: true,
      am_relayed_at: new Date().toISOString(),
    });
    onUpdated();
  }

  const timeAgo = task.created_date ? (() => {
    const diff = Date.now() - new Date(task.created_date).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return "just now";
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
  })() : "";

  return (
    <div className={`bg-white dark:bg-gray-900 rounded-xl border ${pri.border} p-4 space-y-2`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-gray-900 dark:text-white">{task.client_name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {TASK_TYPE_LABELS[task.task_type] || task.task_type || "Task"} · {timeAgo}
            {task.client_revenue ? ` · $${task.client_revenue.toLocaleString()}/mo` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${pri.bg} ${pri.text}`}>
            {pri.label}
          </span>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
            task.status === "completed" ? "bg-green-500/10 text-green-500" :
            task.status === "in_progress" ? "bg-blue-500/10 text-blue-500" :
            "bg-gray-500/10 text-gray-500"
          }`}>
            {task.status === "in_progress" ? "In Progress" : task.status === "completed" ? "Done" : "Open"}
          </span>
        </div>
      </div>

      {/* Trigger detail */}
      {task.trigger_detail && (
        <div className="flex items-center gap-1.5 text-xs text-gray-500">
          <AlertTriangle className="w-3 h-3" />
          {task.trigger_detail}
        </div>
      )}

      {/* Description */}
      {task.description && (
        <p className="text-sm text-gray-700 dark:text-gray-300">{task.description}</p>
      )}

      {/* Expand toggle */}
      <button onClick={() => setExpanded(!expanded)} className="text-xs text-blue-500 flex items-center gap-1">
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? "Collapse" : "Details & Actions"}
      </button>

      {expanded && (
        <div className="space-y-3 pt-2 border-t border-gray-100 dark:border-gray-800">
          {/* Assignee: complete task with feedback */}
          {isAssignee && task.status !== "completed" && (
            <>
              {task.status === "open" && (
                <button onClick={handleStartProgress}
                  className="text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                  Start Working
                </button>
              )}
              <div>
                <label className="text-xs font-medium text-gray-500 block mb-1">
                  What was changed? (required to complete) *
                </label>
                <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={3}
                  placeholder="Describe exactly what you changed — copy adjustments, list expansions, targeting fixes..."
                  className="w-full text-sm px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
                <button onClick={handleComplete} disabled={acting || !feedback.trim()}
                  className="mt-2 flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors disabled:opacity-50">
                  {acting ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Mark Complete
                </button>
              </div>
            </>
          )}

          {/* Completed feedback display */}
          {task.status === "completed" && task.feedback && (
            <div className="bg-green-50 dark:bg-green-500/5 rounded-lg px-3 py-2">
              <p className="text-xs font-medium text-green-600 dark:text-green-400 mb-1 flex items-center gap-1">
                <MessageSquare className="w-3 h-3" /> Feedback
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{task.feedback}</p>
              {task.completed_at && (
                <p className="text-xs text-gray-400 mt-1">
                  Completed {new Date(task.completed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                </p>
              )}
            </div>
          )}

          {/* AM: acknowledge + relay */}
          {isAm && task.status === "completed" && (
            <div className="space-y-2">
              {!task.am_seen ? (
                <button onClick={handleAmSeen}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white transition-colors">
                  <Eye className="w-3 h-3" /> Mark as Seen
                </button>
              ) : (
                <span className="text-xs text-green-500 flex items-center gap-1">
                  <Eye className="w-3 h-3" /> Seen ✓
                </span>
              )}
              {task.am_seen && !task.am_relayed_to_client ? (
                <button onClick={handleAmRelayed}
                  className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white transition-colors">
                  <CheckCircle2 className="w-3 h-3" /> Relayed to Client
                </button>
              ) : task.am_relayed_to_client ? (
                <span className="text-xs text-green-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Relayed to client ✓
                </span>
              ) : null}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
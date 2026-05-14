import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ClipboardList, Filter } from "lucide-react";
import TaskCard from "../components/opstasks/TaskCard";

export default function OpsTaskBoard() {
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("active");

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      loadTasks();
    });
  }, []);

  async function loadTasks() {
    setLoading(true);
    const all = await base44.entities.OpsTask.list("-priority_score", 500);
    setTasks(all);
    setLoading(false);
  }

  const isAdmin = user?.role === "admin";
  const myEmail = user?.email;

  // Determine mode for each task
  function getMode(task) {
    if (task.assigned_to === myEmail) return "assignee";
    if (task.am_email === myEmail) return "am";
    if (isAdmin) return "assignee"; // admins can act as assignee
    return "am";
  }

  const filtered = tasks.filter(t => {
    if (statusFilter === "active") return t.status === "open" || t.status === "in_progress";
    if (statusFilter === "completed") return t.status === "completed";
    if (statusFilter === "needs_ack") return t.status === "completed" && !t.am_seen;
    return true;
  });

  // Sort: priority_score descending, then by created_date
  const sorted = [...filtered].sort((a, b) => {
    if (a.status !== b.status) {
      const order = { in_progress: 0, open: 1, completed: 2 };
      return (order[a.status] ?? 3) - (order[b.status] ?? 3);
    }
    return (b.priority_score || 0) - (a.priority_score || 0);
  });

  const openCount = tasks.filter(t => t.status === "open" || t.status === "in_progress").length;
  const needsAckCount = tasks.filter(t => t.status === "completed" && !t.am_seen).length;

  return (
    <div className="space-y-5 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <ClipboardList className="w-6 h-6 text-blue-500" />
          Ops Task Board
        </h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Auto-generated tasks from daily check-ins and alerts — prioritized by revenue and urgency
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900 dark:text-white">{openCount}</p>
          <p className="text-xs text-gray-500">Active Tasks</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
          <p className="text-2xl font-bold text-yellow-500">{needsAckCount}</p>
          <p className="text-xs text-gray-500">Needs AM Ack</p>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 text-center">
          <p className="text-2xl font-bold text-green-500">{tasks.filter(t => t.status === "completed" && t.am_relayed_to_client).length}</p>
          <p className="text-xs text-gray-500">Fully Closed</p>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-800">
        {[
          { key: "active", label: "Active", count: openCount },
          { key: "needs_ack", label: "Needs AM Ack", count: needsAckCount },
          { key: "completed", label: "Completed" },
          { key: "all", label: "All" },
        ].map(tab => (
          <button key={tab.key} onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === tab.key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-800 dark:hover:text-white"
            }`}>
            {tab.label}
            {tab.count > 0 && (
              <span className="ml-1.5 bg-blue-500 text-white text-xs font-bold rounded-full w-5 h-5 inline-flex items-center justify-center">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Task list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          No tasks in this view.
        </div>
      ) : (
        <div className="space-y-3">
          {sorted.map(task => (
            <TaskCard key={task.id} task={task} mode={getMode(task)} onUpdated={loadTasks} />
          ))}
        </div>
      )}
    </div>
  );
}
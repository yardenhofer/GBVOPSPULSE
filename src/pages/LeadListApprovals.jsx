import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ClipboardList, Plus, Filter } from "lucide-react";
import SubmitListForm from "../components/leadapproval/SubmitListForm";
import ApprovalCard from "../components/leadapproval/ApprovalCard";
import MainAdminSetting from "../components/leadapproval/MainAdminSetting";

export default function LeadListApprovals() {
  const [user, setUser] = useState(null);
  const [clients, setClients] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [statusFilter, setStatusFilter] = useState("All");
  const [scoreFilter, setScoreFilter] = useState("All");
  const isAdmin = user?.role === "admin";

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      loadData(u);
    });
  }, []);

  async function loadData(u) {
    const currentUser = u || user;
    setLoading(true);
    const [clientList, approvals] = await Promise.all([
      currentUser?.role === "admin"
        ? base44.entities.Client.list("-name", 500)
        : base44.entities.Client.filter({ assigned_am: currentUser?.email }, "-name", 500),
      currentUser?.role === "admin"
        ? base44.entities.LeadListApproval.list("-created_date", 200)
        : base44.entities.LeadListApproval.filter({ submitted_by: currentUser?.email }, "-created_date", 200),
    ]);
    setClients(clientList);
    setItems(approvals);
    setLoading(false);
  }

  const filteredItems = items.filter(i => {
    if (statusFilter !== "All" && i.status !== statusFilter) return false;
    if (scoreFilter === "Medium" && (i.ai_score == null || i.ai_score < 40 || i.ai_score >= 70)) return false;
    if (scoreFilter === "High Alert" && (i.ai_score == null || i.ai_score >= 40)) return false;
    return true;
  });

  const mediumCount = items.filter(i => i.ai_score != null && i.ai_score >= 40 && i.ai_score < 70).length;
  const highAlertCount = items.filter(i => i.ai_score != null && i.ai_score < 40).length;

  const pendingCount = items.filter(i => i.status === "Pending").length;

  if (loading) {
    return (
      <div className="space-y-3">
        {Array(4).fill(0).map((_, i) => (
          <div key={i} className="h-24 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-blue-500" />
            Lead List Approvals
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {isAdmin ? "Review and approve lead lists before they go live" : "Submit lead lists for admin review"}
          </p>
        </div>
        <button onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors">
          <Plus className="w-4 h-4" /> Submit List
        </button>
      </div>

      {/* Admin: Main admin setting */}
      {isAdmin && <MainAdminSetting />}

      {/* Submit form */}
      {showForm && (
        <SubmitListForm
          clients={clients}
          user={user}
          onSubmitted={() => {
            setShowForm(false);
            loadData();
          }}
        />
      )}

      {/* Filter tabs */}
      <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-800 flex-wrap">
        {["All", "Pending", "Approved", "Denied"].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === s
                ? s === "Pending" ? "border-yellow-500 text-yellow-500"
                : s === "Approved" ? "border-green-500 text-green-500"
                : s === "Denied" ? "border-red-500 text-red-500"
                : "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
            }`}>
            {s}
            {s === "Pending" && pendingCount > 0 && (
              <span className="ml-1.5 bg-yellow-500 text-white text-xs font-bold rounded-full w-5 h-5 inline-flex items-center justify-center">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
        <span className="mx-1 text-gray-300 dark:text-gray-600">|</span>
        {[
          { key: "All", label: "All Scores", color: "blue" },
          { key: "Medium", label: "⚠️ Medium", color: "yellow", count: mediumCount },
          { key: "High Alert", label: "🔴 High Alert", color: "red", count: highAlertCount },
        ].map(({ key, label, color, count }) => (
          <button key={key} onClick={() => setScoreFilter(key)}
            className={`px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
              scoreFilter === key
                ? `border-${color}-500 text-${color}-500`
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-white"
            }`}>
            {label}
            {count > 0 && (
              <span className={`ml-1.5 bg-${color}-500 text-white text-xs font-bold rounded-full w-5 h-5 inline-flex items-center justify-center`}>
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="text-center py-12 text-gray-500 dark:text-gray-400">
            {statusFilter === "All" 
              ? "No lead lists submitted yet. Click \"Submit List\" to get started."
              : `No ${statusFilter.toLowerCase()} lists.`}
          </div>
        ) : (
          filteredItems.map(item => (
            <ApprovalCard
              key={item.id}
              item={item}
              isAdmin={isAdmin}
              user={user}
              onUpdated={() => loadData()}
            />
          ))
        )}
      </div>
    </div>
  );
}
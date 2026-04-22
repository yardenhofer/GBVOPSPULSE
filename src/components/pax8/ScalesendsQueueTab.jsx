import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { RefreshCw, Send, Copy, FileCheck, AlertTriangle, CheckCircle2, XCircle, Clock, Square, CheckSquare, RotateCw, Upload, Link2 } from "lucide-react";
import ScalesendsSettings from "./ScalesendsSettings";
import ScalesendsConfirmDialog from "./ScalesendsConfirmDialog";
import ScalesendsMarkManualDialog from "./ScalesendsMarkManualDialog";
import WorkspaceManager from "./WorkspaceManager";
import InboxNamePool from "./InboxNamePool";
import InboxProviderManager from "./InboxProviderManager";

const SS_STATUS_COLORS = {
  pending: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400",
  processing: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  complete: "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  failed: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  manual_upload: "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
};

export default function ScalesendsQueueTab() {
  const [queue, setQueue] = useState({ readyQueue: [], processing: [], complete: [], failed: [], manual: [] });
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [submitting, setSubmitting] = useState(null); // tenantId being submitted
  const [bulkSubmitting, setBulkSubmitting] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState(null); // { type: 'single'|'bulk', tenantIds: [], tenantDomain?: '' }
  const [manualDialog, setManualDialog] = useState(null); // { type: 'single'|'bulk', tenantIds: [] }
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState(null);
  const [selectedInboxProviderId, setSelectedInboxProviderId] = useState(null);
  const [uploadingTenantId, setUploadingTenantId] = useState(null);
  const [activeView, setActiveView] = useState("ready");
  const [syncing, setSyncing] = useState(false);
  const [lastSyncResult, setLastSyncResult] = useState(null);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState(null);
  const [porkbunSyncing, setPorkbunSyncing] = useState(false);
  const [porkbunResult, setPorkbunResult] = useState(null);

  async function loadAll() {
    setLoading(true);
    const [qRes, sRes] = await Promise.all([
      base44.functions.invoke("scalesendsSubmit", { action: "getQueue" }),
      base44.functions.invoke("scalesendsSubmit", { action: "getSettings" }),
    ]);
    setQueue(qRes.data);
    setSettings(sRes.data);
    setLoading(false);
  }

  useEffect(() => { loadAll(); }, []);

  async function handleSubmitSingle(tenantId, tenantDomain) {
    setSubmitting(tenantId);
    const res = await base44.functions.invoke("scalesendsSubmit", { action: "submit", tenantId, triggerType: "manual", workspaceId: selectedWorkspaceId, inboxProviderId: selectedInboxProviderId });
    setSubmitting(null);
    setConfirmDialog(null);
    setSelectedWorkspaceId(null);
    setSelectedInboxProviderId(null);
    if (res.data.error) {
      alert(`Submit failed: ${res.data.error}`);
    } else if (res.data.linked) {
      alert(res.data.message);
    }
    await loadAll();
  }

  async function handleBulkSubmit() {
    setBulkSubmitting(true);
    const res = await base44.functions.invoke("scalesendsSubmit", { action: "bulkSubmit", tenantIds: Array.from(selectedIds), workspaceId: selectedWorkspaceId, inboxProviderId: selectedInboxProviderId });
    setBulkSubmitting(false);
    setConfirmDialog(null);
    setSelectedIds(new Set());
    setSelectedWorkspaceId(null);
    setSelectedInboxProviderId(null);
    const results = res.data.results || [];
    const failed = results.filter(r => r.status === "failed");
    const linked = results.filter(r => r.status === "linked");
    const parts = [];
    if (linked.length > 0) parts.push(`${linked.length} linked to existing Scalesends orders`);
    if (failed.length > 0) parts.push(`${failed.length} failed`);
    if (parts.length > 0) alert(parts.join(". ") + ".");
    await loadAll();
  }

  async function handleUploadToInstantly(tenantId) {
    setUploadingTenantId(tenantId);
    const res = await base44.functions.invoke("instantlyUpload", { action: "uploadTenantInboxes", tenantId });
    setUploadingTenantId(null);
    if (res.data.error) {
      alert(`Upload failed: ${res.data.error}`);
    } else {
      alert(`Uploaded ${res.data.success}/${res.data.total} inboxes to ${res.data.workspace}`);
    }
    await loadAll();
  }

  async function handleReconcile() {
    setReconciling(true);
    setReconcileResult(null);
    const res = await base44.functions.invoke("scalesendsSubmit", { action: "reconcile" });
    setReconcileResult(res.data);
    setReconciling(false);
    await loadAll();
  }

  async function handlePorkbunSync() {
    setPorkbunSyncing(true);
    setPorkbunResult(null);
    const res = await base44.functions.invoke("porkbunNameservers", { action: "syncAll" });
    setPorkbunResult(res.data);
    setPorkbunSyncing(false);
  }

  async function handleSyncOrders() {
    setSyncing(true);
    setLastSyncResult(null);
    const res = await base44.functions.invoke("scalesendsSubmit", { action: "syncOrders" });
    setLastSyncResult(res.data);
    setSyncing(false);
    await loadAll();
  }

  async function handleMarkManual(tenantIds, notes) {
    if (tenantIds.length === 1) {
      await base44.functions.invoke("scalesendsSubmit", { action: "markManual", tenantId: tenantIds[0], notes });
    } else {
      await base44.functions.invoke("scalesendsSubmit", { action: "bulkMarkManual", tenantIds, notes });
    }
    setManualDialog(null);
    setSelectedIds(new Set());
    await loadAll();
  }

  async function handleCopyCredentials(tenantId) {
    const res = await base44.functions.invoke("scalesendsSubmit", { action: "copyCredentials", tenantId });
    if (res.data.formatted) {
      await navigator.clipboard.writeText(res.data.formatted);
      alert("Credentials copied to clipboard.");
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === queue.readyQueue.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(queue.readyQueue.map(t => t.id)));
    }
  }

  const VIEWS = [
    { id: "ready", label: "Ready", count: queue.readyQueue.length },
    { id: "processing", label: "Processing", count: queue.processing.length },
    { id: "failed", label: "Failed", count: queue.failed.length },
    { id: "complete", label: "Complete", count: queue.complete.length },
    { id: "manual", label: "Manual", count: queue.manual.length },
  ];

  const currentList = queue[activeView === "ready" ? "readyQueue" : activeView] || [];

  if (loading) {
    return <div className="flex items-center justify-center py-12"><RefreshCw className="w-5 h-5 animate-spin text-gray-400" /></div>;
  }

  return (
    <div className="space-y-4">
      {/* Kill switch warning */}
      {settings?.pauseScalesends && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-center gap-2 text-sm text-red-500 font-medium">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          Scalesends submissions are PAUSED (kill switch active). All submissions blocked.
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={loadAll} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
        <button onClick={handleSyncOrders} disabled={syncing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-green-100 dark:bg-green-500/10 text-green-700 dark:text-green-400 hover:bg-green-200 dark:hover:bg-green-500/20 font-medium disabled:opacity-50">
          <RotateCw className={`w-3 h-3 ${syncing ? "animate-spin" : ""}`} /> Sync Orders
        </button>
        <button onClick={handleReconcile} disabled={reconciling}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-100 dark:bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-500/20 font-medium disabled:opacity-50">
          <Link2 className={`w-3 h-3 ${reconciling ? "animate-spin" : ""}`} /> Reconcile
        </button>
        <button onClick={handlePorkbunSync} disabled={porkbunSyncing}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-indigo-100 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 hover:bg-indigo-200 dark:hover:bg-indigo-500/20 font-medium disabled:opacity-50">
          <RotateCw className={`w-3 h-3 ${porkbunSyncing ? "animate-spin" : ""}`} /> Porkbun NS
        </button>
        <button onClick={() => setShowSettings(!showSettings)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium">
          Settings
        </button>
        {settings && (
          <span className="text-xs text-gray-400">
            Today: {settings.todaySubmissions}/{settings.dailyCap} submissions · API: {settings.apiKeyConfigured ? "✓" : "✗"}
          </span>
        )}
        {lastSyncResult && (
          <span className="text-xs text-green-600 dark:text-green-400">
            Synced {lastSyncResult.syncedCount} order(s){lastSyncResult.backfilledCount > 0 ? `, backfilled ${lastSyncResult.backfilledCount} missing ID(s)` : ""} from {lastSyncResult.totalOrders} total
          </span>
        )}
        {reconcileResult && (
          <span className="text-xs text-amber-600 dark:text-amber-400">
            Reconcile: {reconcileResult.totalScalesendsOrders} Scalesends orders — {reconcileResult.newlyMatched} newly linked, {reconcileResult.alreadyLinkedCount} already linked, {reconcileResult.orphanedInScalesends} orphaned
          </span>
        )}
        {porkbunResult && (
          <span className="text-xs text-indigo-600 dark:text-indigo-400">
            {porkbunResult.skipped ? porkbunResult.message : `Porkbun NS: ${porkbunResult.eligible} eligible — ${porkbunResult.successCount} applied, ${porkbunResult.alreadyMatchedCount} matched, ${porkbunResult.errorCount} errors, ${porkbunResult.skippedCount} skipped${porkbunResult.alreadyDone ? ` · ${porkbunResult.alreadyDone}/${porkbunResult.totalWithJob} already done` : ""}`}
          </span>
        )}
      </div>

      {showSettings && (
        <div className="space-y-4">
          <ScalesendsSettings settings={settings} onToggle={async (key) => {
            await base44.functions.invoke("scalesendsSubmit", { action: "toggleSetting", key });
            await loadAll();
          }} />
          <WorkspaceManager />
          <InboxProviderManager />
          <InboxNamePool />
        </div>
      )}

      {/* View tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg p-1">
        {VIEWS.map(v => (
          <button key={v.id} onClick={() => { setActiveView(v.id); setSelectedIds(new Set()); }}
            className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors flex-1 justify-center ${
              activeView === v.id ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            {v.label} <span className="text-gray-400">({v.count})</span>
          </button>
        ))}
      </div>

      {/* Bulk actions (ready view only) */}
      {activeView === "ready" && queue.readyQueue.length > 0 && (
        <div className="flex items-center gap-2">
          <button onClick={toggleSelectAll} className="text-xs text-blue-600 hover:text-blue-700 font-medium">
            {selectedIds.size === queue.readyQueue.length ? "Deselect All" : "Select All"}
          </button>
          {selectedIds.size > 0 && (
            <>
              <span className="text-xs text-gray-400">{selectedIds.size} selected</span>
              <button onClick={() => setConfirmDialog({ type: "bulk", tenantIds: Array.from(selectedIds) })}
                disabled={bulkSubmitting || settings?.pauseScalesends}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 font-medium">
                <Send className="w-3 h-3" /> Send Selected
              </button>
              <button onClick={() => setManualDialog({ type: "bulk", tenantIds: Array.from(selectedIds) })}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-purple-600 text-white hover:bg-purple-700 font-medium">
                <FileCheck className="w-3 h-3" /> Mark Manual
              </button>
            </>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              {activeView === "ready" && <th className="w-8 px-2 py-2"></th>}
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Company</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Domain</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Tenant ID</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Admin User</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">
                {activeView === "ready" ? "Provisioned" : "Status"}
              </th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {currentList.map(t => (
              <tr key={t.id} className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                {activeView === "ready" && (
                  <td className="px-2 py-2">
                    <button onClick={() => toggleSelect(t.id)}>
                      {selectedIds.has(t.id) ? <CheckSquare className="w-4 h-4 text-blue-600" /> : <Square className="w-4 h-4 text-gray-300" />}
                    </button>
                  </td>
                )}
                <td className="px-3 py-2 font-medium text-gray-900 dark:text-white text-xs">{t.pax8_company_name || "—"}</td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 font-mono text-xs">{t.ms_tenant_domain || t.ms_domain || "—"}</td>
                <td className="px-3 py-2 text-gray-500 font-mono text-xs max-w-[100px] truncate">{t.ms_tenant_id || "—"}</td>
                <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs">{t.ms_admin_username || "—"}</td>
                <td className="px-3 py-2 text-xs">
                  {activeView === "ready" ? (
                    t.provisioning_email_received_at ? new Date(t.provisioning_email_received_at).toLocaleDateString() : "—"
                  ) : (
                    <ScalesendsStatusBadge status={t.scalesends_status} />
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {activeView === "ready" && (
                      <>
                        <button onClick={() => setConfirmDialog({ type: "single", tenantIds: [t.id], tenantDomain: t.ms_tenant_domain })}
                          disabled={submitting === t.id || settings?.pauseScalesends}
                          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                          {submitting === t.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
                          Send
                        </button>
                        <button onClick={() => handleCopyCredentials(t.id)}
                          className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center gap-1">
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                        <button onClick={() => setManualDialog({ type: "single", tenantIds: [t.id] })}
                          className="text-xs px-2 py-1 rounded bg-purple-100 dark:bg-purple-500/10 text-purple-700 dark:text-purple-400 hover:bg-purple-200 flex items-center gap-1">
                          <FileCheck className="w-3 h-3" /> Manual
                        </button>
                      </>
                    )}
                    {activeView === "failed" && (
                      <>
                        <button onClick={() => setConfirmDialog({ type: "single", tenantIds: [t.id], tenantDomain: t.ms_tenant_domain })}
                          disabled={settings?.pauseScalesends}
                          className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                          <Send className="w-3 h-3" /> Retry
                        </button>
                        <button onClick={() => handleCopyCredentials(t.id)}
                          className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 flex items-center gap-1">
                          <Copy className="w-3 h-3" /> Copy
                        </button>
                        <span className="text-xs text-red-400 max-w-[150px] truncate" title={t.scalesends_failure_reason}>{t.scalesends_failure_reason}</span>
                      </>
                    )}
                    {activeView === "complete" && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs text-green-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> {t.scalesends_inbox_count || 0} inboxes
                        </span>
                        {t.scalesends_completed_at && <span className="text-xs text-gray-400">{new Date(t.scalesends_completed_at).toLocaleDateString()}</span>}
                        {t.instantly_workspace_name && (
                          <span className={`text-xs font-medium ${
                            t.instantly_upload_status === "complete" ? "text-green-600" :
                            t.instantly_upload_status === "failed" ? "text-red-500" :
                            t.instantly_upload_status === "uploading" ? "text-blue-500" :
                            "text-purple-500"
                          }`}>
                            → {t.instantly_workspace_name}
                            {t.instantly_upload_status === "complete" && " ✓"}
                            {t.instantly_upload_status === "failed" && " ✗"}
                            {t.instantly_upload_status === "uploading" && " …"}
                          </span>
                        )}
                        {t.instantly_workspace_id && (!t.instantly_upload_status || t.instantly_upload_status === "pending" || t.instantly_upload_status === "failed") && (
                          <button onClick={() => handleUploadToInstantly(t.id)}
                            disabled={uploadingTenantId === t.id}
                            className="text-xs px-2 py-0.5 rounded bg-purple-600 text-white hover:bg-purple-700 disabled:opacity-50 flex items-center gap-1">
                            {uploadingTenantId === t.id ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                            Upload
                          </button>
                        )}
                        {!t.instantly_workspace_id && (
                          <span className="text-xs text-gray-400 italic">No workspace</span>
                        )}
                      </div>
                    )}
                    {activeView === "manual" && (
                      <span className="text-xs text-gray-500">{t.scalesends_marked_manual_by} · {t.scalesends_marked_manual_at ? new Date(t.scalesends_marked_manual_at).toLocaleDateString() : ""}</span>
                    )}
                    {activeView === "processing" && (
                      <span className="text-xs text-blue-500 flex items-center gap-1 flex-wrap">
                        <Clock className="w-3 h-3" /> In progress
                        {t.scalesends_job_id && <span className="text-gray-400 font-mono">· {t.scalesends_job_id.substring(0, 8)}…</span>}
                        {t.instantly_workspace_name && <span className="text-purple-500">→ {t.instantly_workspace_name}</span>}
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {currentList.length === 0 && (
              <tr><td colSpan={activeView === "ready" ? 7 : 6} className="text-center py-8 text-sm text-gray-400">No tenants in this view.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Confirm dialog */}
      {confirmDialog && (
        <ScalesendsConfirmDialog
          count={confirmDialog.tenantIds.length}
          tenantDomain={confirmDialog.tenantDomain}
          workspaceId={selectedWorkspaceId}
          onWorkspaceChange={setSelectedWorkspaceId}
          inboxProviderId={selectedInboxProviderId}
          onInboxProviderChange={setSelectedInboxProviderId}
          onConfirm={() => {
            if (confirmDialog.type === "single") handleSubmitSingle(confirmDialog.tenantIds[0], confirmDialog.tenantDomain);
            else handleBulkSubmit();
          }}
          onCancel={() => { setConfirmDialog(null); setSelectedWorkspaceId(null); setSelectedInboxProviderId(null); }}
          submitting={submitting !== null || bulkSubmitting}
        />
      )}

      {/* Mark manual dialog */}
      {manualDialog && (
        <ScalesendsMarkManualDialog
          count={manualDialog.tenantIds.length}
          onConfirm={(notes) => handleMarkManual(manualDialog.tenantIds, notes)}
          onCancel={() => setManualDialog(null)}
        />
      )}
    </div>
  );
}

function ScalesendsStatusBadge({ status }) {
  if (!status) return <span className="text-xs text-gray-400">—</span>;
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${SS_STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
      {status.replace(/_/g, " ")}
    </span>
  );
}
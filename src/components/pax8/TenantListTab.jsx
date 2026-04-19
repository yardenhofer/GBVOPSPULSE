import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Shield, Eye, EyeOff, Copy, RefreshCw, Pause, Play, Mail, AlertTriangle, CheckCircle2, XCircle, Clock, Search, ChevronDown, ChevronUp } from "lucide-react";

const STATUS_COLORS = {
  ordered: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  tenant_provisioning: "bg-yellow-100 text-yellow-700 dark:bg-yellow-500/10 dark:text-yellow-400",
  tenant_provisioned: "bg-green-100 text-green-700 dark:bg-green-500/10 dark:text-green-400",
  awaiting_parser: "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
  unmatched: "bg-orange-100 text-orange-700 dark:bg-orange-500/10 dark:text-orange-400",
  duplicate_tenant: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  inboxes_creating: "bg-blue-100 text-blue-700 dark:bg-blue-500/10 dark:text-blue-400",
  inboxes_ready: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400",
  scalesends_failed: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
  manually_handled: "bg-purple-100 text-purple-700 dark:bg-purple-500/10 dark:text-purple-400",
  error: "bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400",
};

function StatusBadge({ status }) {
  return (
    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${STATUS_COLORS[status] || "bg-gray-100 text-gray-600"}`}>
      {(status || "unknown").replace(/_/g, " ")}
    </span>
  );
}

export default function TenantListTab() {
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [revealedPasswords, setRevealedPasswords] = useState({});
  const [revealingId, setRevealingId] = useState(null);
  const [emailLogs, setEmailLogs] = useState([]);
  const [showEmailLogs, setShowEmailLogs] = useState(false);

  async function loadData() {
    setLoading(true);
    const [t, statusRes] = await Promise.all([
      base44.entities.TenantLifecycle.list("-created_date", 200),
      base44.functions.invoke("gmailTenantWatch", { action: "getStatus" }),
    ]);
    setTenants(t);
    setPaused(statusRes.data.paused);
    setLoading(false);
  }

  async function loadEmailLogs() {
    const logs = await base44.entities.GmailEmailLog.list("-created_date", 50);
    setEmailLogs(logs);
    setShowEmailLogs(true);
  }

  useEffect(() => { loadData(); }, []);

  async function togglePause() {
    const res = await base44.functions.invoke("gmailTenantWatch", { action: "togglePause" });
    setPaused(res.data.paused);
  }

  async function revealPassword(tenantId) {
    setRevealingId(tenantId);
    const res = await base44.functions.invoke("gmailTenantWatch", { action: "revealPassword", tenantLifecycleId: tenantId });
    setRevealedPasswords(prev => ({ ...prev, [tenantId]: res.data.password }));
    setRevealingId(null);
  }

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text);
  }

  const filtered = tenants.filter(t => {
    if (statusFilter !== "all" && t.overall_status !== statusFilter) return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        (t.pax8_company_name || "").toLowerCase().includes(s) ||
        (t.ms_tenant_domain || "").toLowerCase().includes(s) ||
        (t.ms_admin_username || "").toLowerCase().includes(s) ||
        (t.ms_tenant_id || "").toLowerCase().includes(s)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={togglePause}
          className={`flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
            paused
              ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20"
              : "bg-green-500/10 text-green-600 hover:bg-green-500/20 border border-green-500/20"
          }`}
        >
          {paused ? <><Play className="w-3 h-3" /> Resume Processing</> : <><Pause className="w-3 h-3" /> Pause Processing</>}
        </button>

        <button
          onClick={loadData}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium"
        >
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>

        <button
          onClick={loadEmailLogs}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 font-medium"
        >
          <Mail className="w-3 h-3" /> Email Log
        </button>

        {paused && (
          <div className="flex items-center gap-1.5 text-xs text-red-500">
            <AlertTriangle className="w-3 h-3" />
            Email processing is paused
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search tenants…"
            className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value)}
          className="text-xs px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 outline-none"
        >
          <option value="all">All Status</option>
          <option value="ordered">Ordered</option>
          <option value="tenant_provisioning">Provisioning</option>
          <option value="tenant_provisioned">Provisioned</option>
          <option value="awaiting_parser">Awaiting Parser</option>
          <option value="unmatched">Unmatched</option>
          <option value="duplicate_tenant">Duplicate</option>
          <option value="inboxes_creating">Inboxes Creating</option>
          <option value="inboxes_ready">Inboxes Ready</option>
          <option value="scalesends_failed">Scalesends Failed</option>
          <option value="manually_handled">Manually Handled</option>
          <option value="error">Error</option>
        </select>
        <span className="text-xs text-gray-400">{filtered.length} record{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto border border-gray-200 dark:border-gray-800 rounded-xl">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Company</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Domain</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Tenant ID</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Admin User</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Email Received</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Status</th>
              <th className="text-left px-3 py-2 text-xs font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(t => (
              <TenantRow
                key={t.id}
                tenant={t}
                expanded={expandedId === t.id}
                onToggle={() => setExpandedId(expandedId === t.id ? null : t.id)}
                revealedPassword={revealedPasswords[t.id]}
                revealing={revealingId === t.id}
                onReveal={() => revealPassword(t.id)}
                onCopy={copyToClipboard}
              />
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-8 text-sm text-gray-400">No tenant records found.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Email Log Panel */}
      {showEmailLogs && (
        <EmailLogPanel logs={emailLogs} onClose={() => setShowEmailLogs(false)} />
      )}
    </div>
  );
}

function TenantRow({ tenant: t, expanded, onToggle, revealedPassword, revealing, onReveal, onCopy }) {
  return (
    <>
      <tr className="border-t border-gray-100 dark:border-gray-800 hover:bg-gray-50/50 dark:hover:bg-gray-800/30 cursor-pointer" onClick={onToggle}>
        <td className="px-3 py-2 font-medium text-gray-900 dark:text-white">{t.pax8_company_name || "—"}</td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400 font-mono text-xs">{t.ms_tenant_domain || t.ms_domain || "—"}</td>
        <td className="px-3 py-2 text-gray-500 font-mono text-xs max-w-[120px] truncate">{t.ms_tenant_id || "—"}</td>
        <td className="px-3 py-2 text-gray-600 dark:text-gray-400 text-xs">{t.ms_admin_username || "—"}</td>
        <td className="px-3 py-2 text-gray-500 text-xs">
          {t.provisioning_email_received_at ? new Date(t.provisioning_email_received_at).toLocaleDateString() : "—"}
        </td>
        <td className="px-3 py-2"><StatusBadge status={t.overall_status} /></td>
        <td className="px-3 py-2">
          {expanded ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-gray-100 dark:border-gray-800">
          <td colSpan={7} className="px-4 py-4 bg-gray-50/50 dark:bg-gray-800/20">
            <TenantDetail
              tenant={t}
              revealedPassword={revealedPassword}
              revealing={revealing}
              onReveal={onReveal}
              onCopy={onCopy}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function TenantDetail({ tenant: t, revealedPassword, revealing, onReveal, onCopy }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
        <InfoField label="Pax8 Company" value={t.pax8_company_name} copiable onCopy={onCopy} />
        <InfoField label="Pax8 Company ID" value={t.pax8_company_id} copiable onCopy={onCopy} />
        <InfoField label="MS Domain" value={t.ms_tenant_domain || t.ms_domain} copiable onCopy={onCopy} />
        <InfoField label="Tenant ID" value={t.ms_tenant_id} copiable onCopy={onCopy} />
        <InfoField label="Admin Username" value={t.ms_admin_username} copiable onCopy={onCopy} />
        <div>
          <span className="text-gray-500 block mb-0.5">Admin Password</span>
          <div className="flex items-center gap-1.5">
            {revealedPassword !== undefined ? (
              <>
                <span className="font-mono text-gray-900 dark:text-white">{revealedPassword || "(empty)"}</span>
                <button onClick={() => onCopy(revealedPassword)} className="text-gray-400 hover:text-gray-600"><Copy className="w-3 h-3" /></button>
              </>
            ) : (
              <button
                onClick={onReveal}
                disabled={revealing || !t.ms_admin_password_encrypted}
                className="flex items-center gap-1 text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {revealing ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />}
                {t.ms_admin_password_encrypted ? "Reveal" : "No password"}
              </button>
            )}
          </div>
        </div>
        <InfoField label="Match Method" value={t.match_method} />
        <InfoField label="Flags" value={t.flags} />
        <InfoField label="Email Message ID" value={t.provisioning_email_message_id} />
        <InfoField label="Email Received" value={t.provisioning_email_received_at ? new Date(t.provisioning_email_received_at).toLocaleString() : null} />
      </div>

      {t.provisioning_email_raw_body && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">View raw email body</summary>
          <pre className="mt-2 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-auto max-h-60 text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
            {t.provisioning_email_raw_body}
          </pre>
        </details>
      )}

      {/* Scalesends section */}
      {(t.scalesends_status || t.overall_status === "tenant_provisioned" || t.overall_status === "inboxes_creating" || t.overall_status === "inboxes_ready" || t.overall_status === "scalesends_failed" || t.overall_status === "manually_handled") && (
        <div className="border-t border-gray-200 dark:border-gray-700 pt-3">
          <h5 className="text-xs font-semibold text-gray-500 mb-2">Scalesends Status</h5>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
            <InfoField label="Scalesends Status" value={t.scalesends_status ? t.scalesends_status.replace(/_/g, " ") : "Not started"} />
            {t.scalesends_job_id && <InfoField label="Job ID" value={t.scalesends_job_id} copiable onCopy={onCopy} />}
            {t.scalesends_submitted_at && <InfoField label="Submitted" value={new Date(t.scalesends_submitted_at).toLocaleString()} />}
            {t.scalesends_completed_at && <InfoField label="Completed" value={new Date(t.scalesends_completed_at).toLocaleString()} />}
            {t.scalesends_inbox_count != null && <InfoField label="Inbox Count" value={String(t.scalesends_inbox_count)} />}
            {t.scalesends_trigger_type && <InfoField label="Trigger" value={t.scalesends_trigger_type} />}
            {t.scalesends_failure_reason && <InfoField label="Failure Reason" value={t.scalesends_failure_reason} />}
            {t.scalesends_marked_manual_by && <InfoField label="Marked Manual By" value={t.scalesends_marked_manual_by} />}
            {t.scalesends_marked_manual_at && <InfoField label="Marked Manual At" value={new Date(t.scalesends_marked_manual_at).toLocaleString()} />}
            {t.scalesends_manual_notes && <InfoField label="Manual Notes" value={t.scalesends_manual_notes} />}
            {t.scalesends_retry_count > 0 && <InfoField label="Retry Count" value={String(t.scalesends_retry_count)} />}
          </div>
        </div>
      )}

      {t.error_message && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-xs text-red-400">{t.error_message}</div>
      )}
    </div>
  );
}

function InfoField({ label, value, copiable, onCopy }) {
  return (
    <div>
      <span className="text-gray-500 block mb-0.5">{label}</span>
      <div className="flex items-center gap-1.5">
        <span className="text-gray-900 dark:text-white font-mono break-all">{value || "—"}</span>
        {copiable && value && (
          <button onClick={() => onCopy(value)} className="text-gray-400 hover:text-gray-600 shrink-0"><Copy className="w-3 h-3" /></button>
        )}
      </div>
    </div>
  );
}

function EmailLogPanel({ logs, onClose }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Mail className="w-4 h-4" /> Recent Email Log
        </h4>
        <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600">Close</button>
      </div>
      <div className="max-h-60 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-gray-50 dark:bg-gray-800/50">
            <tr>
              <th className="text-left px-2 py-1.5 text-gray-500">From</th>
              <th className="text-left px-2 py-1.5 text-gray-500">Subject</th>
              <th className="text-left px-2 py-1.5 text-gray-500">Matched</th>
              <th className="text-left px-2 py-1.5 text-gray-500">Processed</th>
              <th className="text-left px-2 py-1.5 text-gray-500">Notes</th>
            </tr>
          </thead>
          <tbody>
            {logs.map(l => (
              <tr key={l.id} className="border-t border-gray-100 dark:border-gray-800">
                <td className="px-2 py-1.5 text-gray-600 dark:text-gray-400 max-w-[150px] truncate">{l.from}</td>
                <td className="px-2 py-1.5 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{l.subject}</td>
                <td className="px-2 py-1.5">
                  {l.matched ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <XCircle className="w-3 h-3 text-gray-300" />}
                </td>
                <td className="px-2 py-1.5">
                  {l.processed ? <CheckCircle2 className="w-3 h-3 text-green-500" /> : <Clock className="w-3 h-3 text-gray-300" />}
                </td>
                <td className="px-2 py-1.5 text-gray-500 max-w-[200px] truncate">{l.processing_notes}</td>
              </tr>
            ))}
            {logs.length === 0 && (
              <tr><td colSpan={5} className="text-center py-4 text-gray-400">No email logs yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
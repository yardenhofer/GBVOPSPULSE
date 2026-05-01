import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Award, CheckCircle2, XCircle, Clock, RefreshCw, DollarSign } from "lucide-react";
import BonusCard from "../components/bonuses/BonusCard";

export default function RetentionBonuses() {
  const [bonuses, setBonuses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [filter, setFilter] = useState("pending");

  async function loadBonuses() {
    setLoading(true);
    const data = await base44.entities.RetentionBonus.list("-created_date", 200);
    setBonuses(data);
    setLoading(false);
  }

  useEffect(() => { loadBonuses(); }, []);

  async function handleScan() {
    setScanning(true);
    setScanResult(null);
    const res = await base44.functions.invoke("checkRetentionBonuses", {});
    setScanResult(res.data);
    setScanning(false);
    await loadBonuses();
  }

  async function handleApprove(bonusId, notes) {
    const user = await base44.auth.me();
    await base44.entities.RetentionBonus.update(bonusId, {
      status: "approved",
      reviewed_by: user.email,
      reviewed_date: new Date().toISOString(),
      admin_notes: notes || "",
    });
    await loadBonuses();
  }

  async function handleDeny(bonusId, notes) {
    const user = await base44.auth.me();
    await base44.entities.RetentionBonus.update(bonusId, {
      status: "denied",
      reviewed_by: user.email,
      reviewed_date: new Date().toISOString(),
      admin_notes: notes || "",
    });
    await loadBonuses();
  }

  const filtered = bonuses.filter(b => filter === "all" || b.status === filter);
  const pending = bonuses.filter(b => b.status === "pending").length;
  const approved = bonuses.filter(b => b.status === "approved").length;
  const totalApprovedAm = bonuses.filter(b => b.status === "approved").reduce((s, b) => s + (b.am_bonus_amount || 0), 0);
  const totalApprovedPm = bonuses.filter(b => b.status === "approved").reduce((s, b) => s + (b.pm_bonus_amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-yellow-500" />
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Retention Bonuses</h1>
        </div>
        <button onClick={handleScan} disabled={scanning}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 font-medium disabled:opacity-50">
          <RefreshCw className={`w-3 h-3 ${scanning ? "animate-spin" : ""}`} />
          {scanning ? "Scanning…" : "Scan for Bonuses"}
        </button>
      </div>

      {scanResult && (
        <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-3 text-sm text-blue-700 dark:text-blue-400">
          Scanned {scanResult.checked} clients — found {scanResult.newBonuses} new bonus{scanResult.newBonuses !== 1 ? "es" : ""}.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-1">
            <Clock className="w-4 h-4 text-yellow-500" />
            <span className="text-xs text-gray-500">Pending</span>
          </div>
          <span className="text-2xl font-bold text-gray-900 dark:text-white">{pending}</span>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle2 className="w-4 h-4 text-green-500" />
            <span className="text-xs text-gray-500">Approved</span>
          </div>
          <span className="text-2xl font-bold text-gray-900 dark:text-white">{approved}</span>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-green-500" />
            <span className="text-xs text-gray-500">AM Total</span>
          </div>
          <span className="text-2xl font-bold text-gray-900 dark:text-white">${totalApprovedAm}</span>
        </div>
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-4 h-4 text-blue-500" />
            <span className="text-xs text-gray-500">PM Total</span>
          </div>
          <span className="text-2xl font-bold text-gray-900 dark:text-white">${totalApprovedPm}</span>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg p-1">
        {[
          { id: "pending", label: "Pending" },
          { id: "approved", label: "Approved" },
          { id: "denied", label: "Denied" },
          { id: "all", label: "All" },
        ].map(t => (
          <button key={t.id} onClick={() => setFilter(t.id)}
            className={`flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              filter === t.id ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm" : "text-gray-500 hover:text-gray-700"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Bonus list */}
      {loading ? (
        <div className="flex justify-center py-12"><RefreshCw className="w-5 h-5 animate-spin text-gray-400" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-sm text-gray-400">No bonuses in this view.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(b => (
            <BonusCard key={b.id} bonus={b} onApprove={handleApprove} onDeny={handleDeny} />
          ))}
        </div>
      )}
    </div>
  );
}
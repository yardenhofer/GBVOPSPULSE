import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { format, differenceInDays } from "date-fns";
import { computeRedFlags, computeAutoStatus } from "../components/utils/redFlagEngine";
import { Bell, CheckCheck, RefreshCw, ExternalLink, Send } from "lucide-react";

export default function Alerts() {
  const [clients, setClients] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [sending, setSending] = useState({});
  const [sent, setSent] = useState({});
  const navigate = useNavigate();

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const data = await base44.entities.Client.list("-updated_date", 200);
    setClients(data);
    setLoading(false);
  }

  // Build alert list from all clients
  const allAlerts = clients.flatMap(c => {
    const flags = computeRedFlags(c);
    return flags.map(f => ({ ...f, client: c, status: computeAutoStatus(c) }));
  });

  const redAlerts = allAlerts.filter(a => a.severity === 'red');
  const yellowAlerts = allAlerts.filter(a => a.severity === 'yellow');

  function AlertCard({ alert }) {
    return (
      <div className={`flex items-center justify-between gap-3 bg-white dark:bg-gray-900 rounded-xl border p-4
        ${alert.severity === 'red' ? 'border-red-500/25' : 'border-yellow-500/25'}`}>
        <div className="flex items-center gap-3">
          <span className="text-2xl">{alert.emoji}</span>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">{alert.client.name}</p>
            <p className={`text-xs font-medium ${alert.severity === 'red' ? 'text-red-400' : 'text-yellow-400'}`}>{alert.message}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">AM: {alert.client.assigned_am || "Unassigned"}</p>
          </div>
        </div>
        <button
          onClick={() => navigate(createPageUrl(`ClientDetail?id=${alert.client.id}`))}
          className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors shrink-0"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Alerts</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            {allAlerts.length === 0 ? "All clear" : `${allAlerts.length} active flag${allAlerts.length !== 1 ? "s" : ""}`}
          </p>
        </div>
        <button onClick={load} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:text-gray-800 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {loading ? (
        Array(4).fill(0).map((_, i) => <div key={i} className="h-20 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />)
      ) : allAlerts.length === 0 ? (
        <div className="text-center py-16">
          <CheckCheck className="w-12 h-12 mx-auto mb-3 text-green-400 opacity-70" />
          <p className="font-semibold text-gray-900 dark:text-white">No active alerts</p>
          <p className="text-sm text-gray-500 mt-1">All clients are in good standing.</p>
        </div>
      ) : (
        <>
          {redAlerts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <h2 className="text-sm font-semibold text-red-400 uppercase tracking-wide">Critical ({redAlerts.length})</h2>
              </div>
              <div className="space-y-2">
                {redAlerts.map((a, i) => <AlertCard key={i} alert={a} />)}
              </div>
            </div>
          )}
          {yellowAlerts.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-yellow-500" />
                <h2 className="text-sm font-semibold text-yellow-400 uppercase tracking-wide">Watch ({yellowAlerts.length})</h2>
              </div>
              <div className="space-y-2">
                {yellowAlerts.map((a, i) => <AlertCard key={i} alert={a} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
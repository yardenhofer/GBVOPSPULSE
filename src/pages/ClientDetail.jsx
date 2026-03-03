import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { computeRedFlags, computeAutoStatus, STATUS_CONFIG } from "../components/utils/redFlagEngine";

import ClientHeader from "../components/clientdetail/ClientHeader";
import LeadFlowSection from "../components/clientdetail/LeadFlowSection";
import ActivityLogSection from "../components/clientdetail/ActivityLogSection";
import ActivityTimeline from "../components/clientdetail/ActivityTimeline";
import PerformanceSection from "../components/clientdetail/PerformanceSection";
import ClientSettingsSection from "../components/clientdetail/ClientSettingsSection";
import RecoveryPlanSection from "../components/clientdetail/RecoveryPlanSection";
import OnboardingChecklist from "../components/clientdetail/OnboardingChecklist";
import EmailTemplatesPanel from "../components/clientdetail/EmailTemplatesPanel";
import LeadVelocityChart from "../components/clientdetail/LeadVelocityChart";
import InstantlyStatsPanel from "../components/clientdetail/InstantlyStatsPanel";
import InboxHealthSection from "../components/clientdetail/InboxHealthSection";

export default function ClientDetail() {
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPackage, setNewPackage] = useState("Email");
  const [creating, setCreating] = useState(false);
  const [inboxHealth, setInboxHealth] = useState(null);
  const navigate = useNavigate();

  const urlParams = new URLSearchParams(window.location.search);
  const clientId = urlParams.get("id");

  useEffect(() => {
    if (clientId) {
      base44.entities.Client.filter({ id: clientId }, "-updated_date", 1)
        .then(res => {
          if (res[0]) setClient(res[0]);
          setLoading(false);
        });
    } else {
      setIsNew(true);
      setLoading(false);
    }
  }, [clientId]);

  async function confirmNewClient() {
    if (!newName.trim()) return;
    setCreating(true);
    const created = await base44.entities.Client.create({
      name: newName.trim(),
      status: "Healthy",
      client_sentiment: "Happy",
      package_type: newPackage,
    });
    navigate(createPageUrl(`ClientDetail?id=${created.id}`), { replace: true });
  }

  function handleClientUpdate(updates) {
    setClient(prev => ({ ...prev, ...updates }));
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {Array(4).fill(0).map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
    );
  }

  if (isNew && !client) {
    return (
      <div className="max-w-lg mx-auto mt-12">
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-6 space-y-5">
          <div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">Add New Client</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Fill in the basics to create a new client profile.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Client Name *</label>
            <input
              type="text"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Package Type</label>
            <select
              value={newPackage}
              onChange={e => setNewPackage(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            >
              <option value="Email">Email</option>
              <option value="LinkedIn">LinkedIn</option>
              <option value="Hybrid">Hybrid</option>
            </select>
          </div>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={confirmNewClient}
              disabled={!newName.trim() || creating}
              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {creating ? "Creating…" : "Create Client"}
            </button>
            <button
              onClick={() => navigate(createPageUrl("Dashboard"))}
              className="px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="text-center py-12 text-gray-500">Client not found.</div>
    );
  }

  const flags = computeRedFlags(client);
  const status = computeAutoStatus(client);
  const isCritical = status === "Critical";

  return (
    <div className="space-y-4 max-w-5xl">
      {/* Flags bar */}
      {flags.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl px-4 py-3 flex flex-wrap gap-2">
          {flags.map((f, i) => (
            <span key={i} className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full
              ${f.severity === 'red' ? 'bg-red-500/10 text-red-400' : 'bg-yellow-500/10 text-yellow-400'}`}>
              {f.emoji} {f.message}
            </span>
          ))}
        </div>
      )}

      <ClientHeader
        client={client}
        status={status}
        onBack={() => navigate(createPageUrl("Dashboard"))}
        onDelete={async () => {
          await base44.entities.Client.delete(client.id);
          navigate(createPageUrl("Dashboard"));
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeadFlowSection client={client} />
        <PerformanceSection client={client} onClientUpdate={handleClientUpdate} />
      </div>

      <InstantlyStatsPanel client={client} onInboxHealth={setInboxHealth} />

      {inboxHealth && <InboxHealthSection inboxHealth={inboxHealth} />}

      {/* Lead velocity */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <LeadVelocityChart client={client} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ActivityLogSection client={client} />
        <OnboardingChecklist client={client} onClientUpdate={handleClientUpdate} />
      </div>

      {isCritical && <RecoveryPlanSection client={client} />}

      <EmailTemplatesPanel client={client} />

      {/* Full timeline */}
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
        <div className="flex items-center gap-2 mb-4">
          <div className="w-4 h-4 rounded-full bg-blue-500/20 flex items-center justify-center">
            <div className="w-1.5 h-1.5 rounded-full bg-blue-400" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Client Timeline</h3>
        </div>
        <ActivityTimeline client={client} />
      </div>

      <ClientSettingsSection client={client} onClientUpdate={handleClientUpdate} />
    </div>
  );
}
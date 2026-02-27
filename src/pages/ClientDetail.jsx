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

export default function ClientDetail() {
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isNew, setIsNew] = useState(false);
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
      // New client
      setIsNew(true);
      createNewClient();
    }
  }, [clientId]);

  async function createNewClient() {
    const created = await base44.entities.Client.create({
      name: "New Client",
      status: "Healthy",
      client_sentiment: "Happy",
      package_type: "PPL",
    });
    navigate(createPageUrl(`ClientDetail?id=${created.id}`), { replace: true });
  }

  function handleClientUpdate(updates) {
    setClient(prev => ({ ...prev, ...updates }));
  }

  if (loading || !client) {
    return (
      <div className="space-y-4">
        {Array(4).fill(0).map((_, i) => (
          <div key={i} className="h-32 rounded-xl bg-gray-200 dark:bg-gray-800 animate-pulse" />
        ))}
      </div>
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

      <ClientHeader client={client} status={status} onBack={() => navigate(createPageUrl("Dashboard"))} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeadFlowSection client={client} />
        <PerformanceSection client={client} onClientUpdate={handleClientUpdate} />
      </div>

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
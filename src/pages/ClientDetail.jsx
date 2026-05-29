import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { base44 } from "@/api/base44Client";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { computeRedFlags, computeAutoStatus, STATUS_CONFIG } from "../components/utils/redFlagEngine";
import NewClientForm from "../components/clientdetail/NewClientForm";

import ClientHeader from "../components/clientdetail/ClientHeader";
import LeadFlowSection from "../components/clientdetail/LeadFlowSection";
import ActivityLogSection from "../components/clientdetail/ActivityLogSection";
import ActivityTimeline from "../components/clientdetail/ActivityTimeline";
import PerformanceSection from "../components/clientdetail/PerformanceSection";
import ClientSettingsSection from "../components/clientdetail/ClientSettingsSection";
import RecoveryPlanSection from "../components/clientdetail/RecoveryPlanSection";
import OnboardingChecklist from "../components/clientdetail/OnboardingChecklist";
import OnboardingStageTracker from "../components/clientdetail/OnboardingStageTracker";

import LeadVelocityChart from "../components/clientdetail/LeadVelocityChart";
import InstantlyStatsPanel from "../components/clientdetail/InstantlyStatsPanel";
import InboxHealthSection from "../components/clientdetail/InboxHealthSection";
import AIInsightsPanel from "../components/clientdetail/AIInsightsPanel";
import DQLinkSection from "../components/clientdetail/DQLinkSection";
import EmailSequenceSection from "../components/clientdetail/EmailSequenceSection";
import InboxPlacementSection from "../components/clientdetail/InboxPlacementSection";

export default function ClientDetail() {
  const [client, setClient] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isNew, setIsNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPackage, setNewPackage] = useState("Email");
  const [creating, setCreating] = useState(false);
  const [inboxHealth, setInboxHealth] = useState(null);
  const navigate = useNavigate();

  const clientId = new URLSearchParams(window.location.search).get("id");

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

  async function confirmNewClient(data) {
    setCreating(true);
    const today = new Date().toISOString().split("T")[0];
    const created = await base44.entities.Client.create({
      name: data.name,
      status: "Healthy",
      client_sentiment: "Happy",
      package_type: data.package_type,
      revenue: data.revenue,
      monthly_sends_target: data.monthly_sends_target,
      target_leads_per_week: data.target_leads_per_week,
      start_date: data.start_date,
      contract_end_date: data.contract_end_date || undefined,
      min_contract_months: data.min_contract_months,
      assigned_am: data.assigned_am,
      assigned_pm: data.assigned_pm || undefined,
      onboarding_stage: "Infrastructure Ordered",
      onboarding_stage_date: today,
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
      <NewClientForm
        onSubmit={confirmNewClient}
        onCancel={() => navigate(createPageUrl("Dashboard"))}
        creating={creating}
      />
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

      <OnboardingStageTracker client={client} onClientUpdate={handleClientUpdate} />

      <ClientHeader
        client={client}
        status={status}
        onBack={() => navigate(createPageUrl("Dashboard"))}
        onOffboard={async () => {
          await base44.functions.invoke('offboardClient', { client_id: client.id });
          setClient(prev => ({ ...prev, status: 'Off-Boarding', offboarding_date: new Date().toISOString().split("T")[0] }));
        }}
        onTerminate={async () => {
          const today = new Date().toISOString().split("T")[0];
          await base44.entities.Client.update(client.id, { status: "Terminated", terminated_date: today });
          navigate(createPageUrl("Dashboard"));
        }}
        onDelete={async () => {
          await base44.entities.Client.delete(client.id);
          navigate(createPageUrl("Dashboard"));
        }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <LeadFlowSection client={client} />
        <PerformanceSection client={client} onClientUpdate={handleClientUpdate} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <InstantlyStatsPanel client={client} onInboxHealth={setInboxHealth} />
        <AIInsightsPanel client={client} />
      </div>

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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DQLinkSection client={client} onClientUpdate={handleClientUpdate} />
        <div />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <EmailSequenceSection client={client} onClientUpdate={handleClientUpdate} />
        <InboxPlacementSection client={client} onClientUpdate={handleClientUpdate} />
      </div>

      <div className="bg-white dark:bg-gray-900 rounded-xl border border-dashed border-gray-300 dark:border-gray-700 p-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
            <span className="text-base">✉️</span>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Email Templates</h3>
            <p className="text-xs text-gray-400">Send pre-built emails directly to clients</p>
          </div>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">Coming Soon</span>
      </div>

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
import { base44 } from "@/api/base44Client";
import { CheckCircle2, Circle, ClipboardList } from "lucide-react";

const STEPS = [
  { key: "onboarding_kickoff_done",       label: "Kickoff call completed" },
  { key: "onboarding_contract_signed",    label: "Contract signed" },
  { key: "onboarding_crm_connected",      label: "CRM connected" },
  { key: "onboarding_lead_list_received", label: "Lead list received" },
  { key: "onboarding_campaign_live",      label: "Campaign live" },
];

export default function OnboardingChecklist({ client, onClientUpdate }) {
  const completed = STEPS.filter(s => client[s.key]).length;
  const allDone = completed === STEPS.length;

  async function toggle(key) {
    const newVal = !client[key];
    await base44.entities.Client.update(client.id, { [key]: newVal });
    onClientUpdate({ [key]: newVal });
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClipboardList className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Onboarding</h3>
        </div>
        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full
          ${allDone ? "bg-green-500/10 text-green-400" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
          {completed}/{STEPS.length}
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full mb-3 overflow-hidden">
        <div
          className="h-full rounded-full transition-all bg-blue-500"
          style={{ width: `${(completed / STEPS.length) * 100}%` }}
        />
      </div>

      <div className="space-y-2">
        {STEPS.map(({ key, label }) => {
          const done = !!client[key];
          return (
            <button
              key={key}
              onClick={() => toggle(key)}
              className="w-full flex items-center gap-2.5 text-left group"
            >
              {done
                ? <CheckCircle2 className="w-4 h-4 text-green-400 shrink-0" />
                : <Circle className="w-4 h-4 text-gray-300 dark:text-gray-600 group-hover:text-gray-400 shrink-0 transition-colors" />
              }
              <span className={`text-xs transition-colors ${done ? "text-gray-400 line-through" : "text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white"}`}>
                {label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
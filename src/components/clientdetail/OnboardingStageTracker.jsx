import { base44 } from "@/api/base44Client";
import { differenceInDays } from "date-fns";
import { Package, Cog, Upload, Rocket, Check } from "lucide-react";

const STAGES = [
  { key: "Infrastructure Ordered", label: "Ordered", icon: Package },
  { key: "Infrastructure In Process", label: "In Process", icon: Cog },
  { key: "Infrastructure Uploaded", label: "Uploaded", icon: Upload },
  { key: "Infrastructure Live", label: "Live", icon: Rocket },
];

export function isOnboardingStageVisible(client) {
  if (!client.onboarding_stage) return false;
  // If stage is "Infrastructure Live" and it's been more than 2 days, hide it
  if (client.onboarding_stage === "Infrastructure Live" && client.onboarding_stage_date) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const stageDate = new Date(client.onboarding_stage_date + "T00:00:00");
    if (differenceInDays(now, stageDate) > 2) return false;
  }
  return true;
}

export default function OnboardingStageTracker({ client, onClientUpdate }) {
  if (!isOnboardingStageVisible(client)) return null;

  const currentIndex = STAGES.findIndex(s => s.key === client.onboarding_stage);

  async function setStage(stage) {
    const today = new Date().toISOString().split("T")[0];
    await base44.entities.Client.update(client.id, {
      onboarding_stage: stage,
      onboarding_stage_date: today,
    });
    onClientUpdate({ onboarding_stage: stage, onboarding_stage_date: today });
  }

  return (
    <div className="bg-gradient-to-r from-blue-500/5 via-indigo-500/5 to-violet-500/5 border border-blue-200 dark:border-blue-500/20 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-500/20 flex items-center justify-center">
            <Rocket className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Infrastructure Stage</h3>
        </div>
        {client.onboarding_stage === "Infrastructure Live" && (
          <span className="text-[10px] font-bold text-green-500 bg-green-500/10 px-2 py-0.5 rounded-full animate-pulse">
            LIVE
          </span>
        )}
      </div>

      {/* Stage pipeline */}
      <div className="flex items-center gap-0">
        {STAGES.map((stage, i) => {
          const Icon = stage.icon;
          const isCompleted = i < currentIndex;
          const isCurrent = i === currentIndex;
          const isFuture = i > currentIndex;

          return (
            <div key={stage.key} className="flex items-center flex-1">
              <button
                onClick={() => setStage(stage.key)}
                className={`flex flex-col items-center gap-1.5 flex-1 py-2 rounded-lg transition-all ${
                  isCurrent
                    ? "bg-blue-500/10"
                    : "hover:bg-gray-100 dark:hover:bg-gray-800/50"
                }`}
              >
                <div className={`w-9 h-9 rounded-full flex items-center justify-center border-2 transition-all ${
                  isCompleted
                    ? "bg-green-500 border-green-500 text-white"
                    : isCurrent
                      ? "bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/30"
                      : "bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-400"
                }`}>
                  {isCompleted ? <Check className="w-4 h-4" /> : <Icon className="w-4 h-4" />}
                </div>
                <span className={`text-[11px] font-medium text-center leading-tight ${
                  isCompleted
                    ? "text-green-500"
                    : isCurrent
                      ? "text-blue-500 font-semibold"
                      : "text-gray-400"
                }`}>
                  {stage.label}
                </span>
              </button>
              {i < STAGES.length - 1 && (
                <div className={`w-6 h-0.5 shrink-0 -mx-1 ${
                  i < currentIndex ? "bg-green-500" : "bg-gray-200 dark:bg-gray-700"
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
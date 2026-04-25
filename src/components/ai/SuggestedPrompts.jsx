import { AlertTriangle, TrendingUp, Search, BarChart3 } from "lucide-react";

const PROMPTS = [
  {
    icon: AlertTriangle,
    label: "Find Data Issues",
    prompt: "Scan all client data and find every logical inconsistency, data error, or mismatch. For example: status doesn't match performance, missing check-ins, stale touchpoints, sentiment mismatches, etc. Rate each by severity.",
    color: "text-red-500 bg-red-500/10",
  },
  {
    icon: TrendingUp,
    label: "Strategic Recommendations",
    prompt: "Based on all current data, give me your top 10 most actionable strategic recommendations. Focus on revenue protection, client retention risks, upsell opportunities, and operational improvements.",
    color: "text-blue-500 bg-blue-500/10",
  },
  {
    icon: Search,
    label: "At-Risk Audit",
    prompt: "Do a deep audit of all clients currently at risk or critical status. For each one, tell me: why they're at risk, what we've done so far, what's missing, and your recommended next steps.",
    color: "text-orange-500 bg-orange-500/10",
  },
  {
    icon: BarChart3,
    label: "Weekly Health Report",
    prompt: "Generate a comprehensive weekly operations health report covering: client status distribution, lead pipeline health, AM performance patterns, infrastructure health, and the top 5 things that need attention this week.",
    color: "text-emerald-500 bg-emerald-500/10",
  },
];

export default function SuggestedPrompts({ onSelect }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {PROMPTS.map((p, i) => (
        <button
          key={i}
          onClick={() => onSelect(p.prompt)}
          className="flex items-start gap-3 p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 hover:border-blue-400 dark:hover:border-blue-500 hover:shadow-md transition-all text-left group"
        >
          <div className={`shrink-0 w-9 h-9 rounded-lg flex items-center justify-center ${p.color}`}>
            <p.icon className="w-4.5 h-4.5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{p.label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">{p.prompt.substring(0, 80)}…</p>
          </div>
        </button>
      ))}
    </div>
  );
}
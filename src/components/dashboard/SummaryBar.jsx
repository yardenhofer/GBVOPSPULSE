import { AlertTriangle, TrendingUp, Users, ShieldCheck } from "lucide-react";

const STATS = [
  { label: "Total Clients", key: "total", icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
  { label: "Healthy", key: "healthy", icon: ShieldCheck, color: "text-green-400", bg: "bg-green-500/10" },
  { label: "Monitor / At Risk", key: "atRisk", icon: TrendingUp, color: "text-yellow-400", bg: "bg-yellow-500/10" },
  { label: "Needs Attention", key: "critical", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
];

export default function SummaryBar({ clients, computeAutoStatus }) {
  const counts = {
    total: clients.length,
    healthy: clients.filter(c => computeAutoStatus(c) === "Healthy").length,
    atRisk: clients.filter(c => ["Monitor", "At Risk"].includes(computeAutoStatus(c))).length,
    critical: clients.filter(c => computeAutoStatus(c) === "Critical").length,
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {STATS.map(({ label, key, icon: Icon, color, bg }) => (
        <div key={key} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 flex items-center gap-4">
          <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center shrink-0`}>
            <Icon className={`w-5 h-5 ${color}`} />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{counts[key]}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
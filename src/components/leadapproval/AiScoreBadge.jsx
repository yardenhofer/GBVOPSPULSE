import { Sparkles } from "lucide-react";

export default function AiScoreBadge({ score, recommendation }) {
  if (score == null) return null;

  const color = score >= 75
    ? "text-green-500 bg-green-500/10 border-green-500/20"
    : score >= 50
    ? "text-yellow-500 bg-yellow-500/10 border-yellow-500/20"
    : "text-red-500 bg-red-500/10 border-red-500/20";

  return (
    <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${color}`}>
      <Sparkles className="w-3 h-3" />
      AI: {score}/100
    </span>
  );
}
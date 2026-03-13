import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw } from "lucide-react";

const REC_STYLES = {
  "Approve": { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/20" },
  "Review Carefully": { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  "Deny": { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
};

export default function AiAnalysisPanel({ item, onAnalyzed }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(
    item.ai_score != null
      ? {
          score: item.ai_score,
          summary: item.ai_summary,
          strengths: item.ai_strengths ? item.ai_strengths.split("|||") : [],
          concerns: item.ai_concerns ? item.ai_concerns.split("|||") : [],
          recommendation: item.ai_recommendation,
        }
      : null
  );

  async function runAnalysis() {
    setAnalyzing(true);
    const res = await base44.functions.invoke("analyzeLeadList", { approval_id: item.id });
    setResult(res.data);
    setAnalyzing(false);
    onAnalyzed?.();
  }

  if (!result) {
    return (
      <button
        onClick={runAnalysis}
        disabled={analyzing}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
      >
        {analyzing ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
        {analyzing ? "Analyzing…" : "AI Analyze List"}
      </button>
    );
  }

  const scoreColor = result.score >= 75
    ? "text-green-500"
    : result.score >= 50
    ? "text-yellow-500"
    : "text-red-500";

  const scoreBg = result.score >= 75
    ? "bg-green-500"
    : result.score >= 50
    ? "bg-yellow-500"
    : "bg-red-500";

  const recCfg = REC_STYLES[result.recommendation] || REC_STYLES["Review Carefully"];
  const RecIcon = recCfg.icon;

  return (
    <div className="bg-purple-50/50 dark:bg-purple-500/5 border border-purple-200/50 dark:border-purple-500/10 rounded-lg p-3 space-y-2.5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">AI Analysis</span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-lg font-bold ${scoreColor}`}>{result.score}</span>
          <span className="text-xs text-gray-400">/100</span>
          <button onClick={runAnalysis} disabled={analyzing}
            className="p-1 rounded hover:bg-purple-100 dark:hover:bg-purple-500/10 transition-colors disabled:opacity-50">
            {analyzing ? <Loader2 className="w-3 h-3 animate-spin text-purple-500" /> : <RefreshCw className="w-3 h-3 text-purple-400" />}
          </button>
        </div>
      </div>

      {/* Score bar */}
      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${scoreBg}`} style={{ width: `${result.score}%` }} />
      </div>

      {/* Recommendation */}
      <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${recCfg.bg} ${recCfg.color} border ${recCfg.border}`}>
        <RecIcon className="w-3 h-3" />
        {result.recommendation}
      </div>

      {/* Summary */}
      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{result.summary}</p>

      {/* Strengths & Concerns */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {result.strengths?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-green-600 dark:text-green-400 uppercase tracking-wide mb-1">Strengths</p>
            <ul className="space-y-0.5">
              {result.strengths.map((s, i) => (
                <li key={i} className="flex items-start gap-1 text-xs text-gray-600 dark:text-gray-400">
                  <CheckCircle2 className="w-3 h-3 text-green-500 shrink-0 mt-0.5" />
                  {s}
                </li>
              ))}
            </ul>
          </div>
        )}
        {result.concerns?.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-red-600 dark:text-red-400 uppercase tracking-wide mb-1">Concerns</p>
            <ul className="space-y-0.5">
              {result.concerns.map((c, i) => (
                <li key={i} className="flex items-start gap-1 text-xs text-gray-600 dark:text-gray-400">
                  <AlertTriangle className="w-3 h-3 text-red-500 shrink-0 mt-0.5" />
                  {c}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
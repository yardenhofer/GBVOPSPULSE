import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Sparkles, Loader2, CheckCircle2, AlertTriangle, XCircle, RefreshCw, FileText, Mail } from "lucide-react";

const REC_STYLES = {
  "Approve": { icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", border: "border-green-500/20" },
  "Review Carefully": { icon: AlertTriangle, color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/20" },
  "Deny": { icon: XCircle, color: "text-red-500", bg: "bg-red-500/10", border: "border-red-500/20" },
};

function AnalysisSection({ label, icon: Icon, iconColor, result }) {
  if (!result) return null;

  const scoreColor = result.score >= 75 ? "text-green-500" : result.score >= 50 ? "text-yellow-500" : "text-red-500";
  const scoreBg = result.score >= 75 ? "bg-green-500" : result.score >= 50 ? "bg-yellow-500" : "bg-red-500";
  const recCfg = REC_STYLES[result.recommendation] || REC_STYLES["Review Carefully"];
  const RecIcon = recCfg.icon;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Icon className={`w-3.5 h-3.5 ${iconColor}`} />
          <span className="text-[10px] font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400">{label}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className={`text-lg font-bold ${scoreColor}`}>{result.score}</span>
          <span className="text-xs text-gray-400">/100</span>
        </div>
      </div>

      <div className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${scoreBg}`} style={{ width: `${result.score}%` }} />
      </div>

      <div className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${recCfg.bg} ${recCfg.color} border ${recCfg.border}`}>
        <RecIcon className="w-3 h-3" />
        {result.recommendation}
      </div>

      <p className="text-xs text-gray-700 dark:text-gray-300 leading-relaxed">{result.summary}</p>

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

function parseResult(item, prefix) {
  const score = item[`${prefix}score`];
  if (score == null) return null;
  return {
    score,
    summary: item[`${prefix}summary`],
    strengths: item[`${prefix}strengths`] ? item[`${prefix}strengths`].split("|||") : [],
    concerns: item[`${prefix}concerns`] ? item[`${prefix}concerns`].split("|||") : [],
    recommendation: item[`${prefix}recommendation`],
  };
}

export default function AiAnalysisPanel({ item, onAnalyzed }) {
  const [analyzing, setAnalyzing] = useState(false);
  const [leadResult, setLeadResult] = useState(parseResult(item, "ai_"));
  const [copyResult, setCopyResult] = useState(parseResult(item, "copy_ai_"));

  async function runAnalysis() {
    setAnalyzing(true);
    const res = await base44.functions.invoke("analyzeLeadList", { approval_id: item.id });
    setLeadResult(res.data.lead);
    setCopyResult(res.data.copy);
    setAnalyzing(false);
    onAnalyzed?.();
  }

  if (!leadResult && !copyResult) {
    return (
      <button
        onClick={runAnalysis}
        disabled={analyzing}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
      >
        {analyzing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
        {analyzing ? "Analyzing List & Copy…" : "AI Analyze List & Copy"}
      </button>
    );
  }

  return (
    <div className="bg-purple-50/50 dark:bg-purple-500/5 border border-purple-200/50 dark:border-purple-500/10 rounded-lg p-3 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-purple-500" />
          <span className="text-xs font-semibold text-purple-600 dark:text-purple-400">AI Analysis</span>
        </div>
        <button onClick={runAnalysis} disabled={analyzing}
          className="p-1 rounded hover:bg-purple-100 dark:hover:bg-purple-500/10 transition-colors disabled:opacity-50">
          {analyzing ? <Loader2 className="w-3 h-3 animate-spin text-purple-500" /> : <RefreshCw className="w-3 h-3 text-purple-400" />}
        </button>
      </div>

      {/* Lead List Analysis */}
      <AnalysisSection label="Lead List" icon={FileText} iconColor="text-blue-500" result={leadResult} />

      {/* Divider */}
      {leadResult && copyResult && (
        <div className="border-t border-purple-200/50 dark:border-purple-500/10" />
      )}

      {/* Copy Analysis */}
      <AnalysisSection label="Client Copy" icon={Mail} iconColor="text-orange-500" result={copyResult} />
    </div>
  );
}
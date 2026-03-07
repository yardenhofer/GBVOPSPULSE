import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Brain, TrendingUp, TrendingDown, Minus, AlertTriangle, MessageSquare, Sparkles, RefreshCw } from "lucide-react";
import { format } from "date-fns";

const SENTIMENT_STYLES = {
  Happy: { bg: "bg-green-500/10", color: "text-green-400", emoji: "😊" },
  Neutral: { bg: "bg-gray-500/10", color: "text-gray-400", emoji: "😐" },
  "Slightly Concerned": { bg: "bg-yellow-500/10", color: "text-yellow-400", emoji: "😟" },
  Unhappy: { bg: "bg-red-500/10", color: "text-red-400", emoji: "😠" },
};

const TREND_CONFIG = {
  Improving: { icon: TrendingUp, color: "text-green-400", bg: "bg-green-500/10", label: "Improving" },
  Stable: { icon: Minus, color: "text-gray-400", bg: "bg-gray-500/10", label: "Stable" },
  Declining: { icon: TrendingDown, color: "text-red-400", bg: "bg-red-500/10", label: "Declining" },
};

export default function AIInsightsPanel({ client }) {
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    loadInsights();
  }, [client.id]);

  async function loadInsights() {
    setLoading(true);
    const data = await base44.entities.SlackInsight.filter(
      { client_id: client.id }, "-created_date", 5
    );
    setInsights(data);
    setLoading(false);
  }

  async function runAnalysis() {
    setRunning(true);
    try {
      await base44.functions.invoke("slackSentimentAnalysis", { client_id: client.id });
    } catch (e) {
      console.error("Sentiment analysis error:", e);
    }
    await loadInsights();
    setRunning(false);
  }

  const latest = insights[0];
  const sentStyle = latest ? SENTIMENT_STYLES[latest.sentiment] || SENTIMENT_STYLES.Neutral : null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-purple-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">AI Insights</h3>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 font-medium">Slack Analysis</span>
        </div>
        <button
          onClick={runAnalysis}
          disabled={running}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-purple-400 transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${running ? "animate-spin" : ""}`} />
          {running ? "Analyzing…" : "Run Now"}
        </button>
      </div>

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-12 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
          ))}
        </div>
      ) : !latest ? (
        <div className="text-center py-8">
          <Sparkles className="w-8 h-8 text-gray-300 dark:text-gray-600 mx-auto mb-2" />
          <p className="text-sm text-gray-500 dark:text-gray-400">No AI insights yet</p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
            {client.slack_channel_id ? "Insights will appear after the next scheduled analysis" : "No Slack channel matched for this client"}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Sentiment */}
          <div className={`rounded-lg ${sentStyle.bg} px-4 py-3`}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500 dark:text-gray-400">Current Sentiment</span>
              <span className="text-xs text-gray-400">
                {format(new Date(latest.analysis_date), "MMM d, h:mm a")}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{sentStyle.emoji}</span>
                <div>
                  <p className={`text-sm font-bold ${sentStyle.color}`}>{latest.sentiment}</p>
                  <p className="text-xs text-gray-400">Score: {latest.sentiment_score}/10 · {latest.messages_analyzed} msgs</p>
                </div>
              </div>
              {latest.sentiment_trend && (() => {
                const trend = TREND_CONFIG[latest.sentiment_trend] || TREND_CONFIG.Stable;
                const TrendIcon = trend.icon;
                return (
                  <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full ${trend.bg}`}>
                    <TrendIcon className={`w-3.5 h-3.5 ${trend.color}`} />
                    <span className={`text-xs font-semibold ${trend.color}`}>{trend.label}</span>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Summary */}
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">Summary</span>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400">{latest.summary}</p>
          </div>

          {/* Upsell */}
          {latest.upsell_opportunities && latest.upsell_opportunities !== "None detected" && (
            <div className="rounded-lg bg-green-500/5 border border-green-500/20 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <TrendingUp className="w-3.5 h-3.5 text-green-400" />
                <span className="text-xs font-semibold text-green-400">Upsell Opportunities</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{latest.upsell_opportunities}</p>
            </div>
          )}

          {/* Risk */}
          {latest.risk_signals && latest.risk_signals !== "None detected" && (
            <div className="rounded-lg bg-red-500/5 border border-red-500/20 px-3 py-2.5">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
                <span className="text-xs font-semibold text-red-400">Risk Signals</span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400">{latest.risk_signals}</p>
            </div>
          )}

          {/* Key Topics */}
          {latest.key_topics && (
            <div>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">Key Topics</span>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {latest.key_topics.split(",").map((t, i) => (
                  <span key={i} className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
                    {t.trim()}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          {insights.length > 1 && (
            <div className="border-t border-gray-100 dark:border-gray-800 pt-3">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Recent History</p>
              <div className="space-y-1.5">
                {insights.slice(1).map(ins => {
                  const s = SENTIMENT_STYLES[ins.sentiment] || SENTIMENT_STYLES.Neutral;
                  const t = ins.sentiment_trend ? (TREND_CONFIG[ins.sentiment_trend] || TREND_CONFIG.Stable) : null;
                  const TIcon = t?.icon;
                  return (
                    <div key={ins.id} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span>{s.emoji}</span>
                        <span className={`font-medium ${s.color}`}>{ins.sentiment}</span>
                        <span className="text-gray-400">({ins.sentiment_score}/10)</span>
                        {t && TIcon && <TIcon className={`w-3 h-3 ${t.color}`} />}
                      </div>
                      <span className="text-gray-400">{format(new Date(ins.analysis_date), "MMM d")}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
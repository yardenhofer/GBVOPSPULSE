import { LineChart, Line, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export default function LeadVelocityChart({ client }) {
  const weeks = [
    { week: "4 wks ago", leads: client.leads_week_4 ?? 0 },
    { week: "3 wks ago", leads: client.leads_week_3 ?? 0 },
    { week: "Last wk",   leads: client.leads_last_week ?? 0 },
    { week: "This wk",   leads: client.leads_this_week ?? 0 },
  ];

  const target = client.target_leads_per_week;
  const current = client.leads_this_week ?? 0;
  const prev = client.leads_last_week ?? 0;
  const trend = current - prev;
  const trendPct = prev > 0 ? Math.round(((current - prev) / prev) * 100) : null;

  const TrendIcon = trend > 0 ? TrendingUp : trend < 0 ? TrendingDown : Minus;
  const trendColor = trend > 0 ? "text-green-400" : trend < 0 ? "text-red-400" : "text-gray-400";
  const lineColor = trend >= 0 ? "#22c55e" : "#ef4444";

  const hasData = weeks.some(w => w.leads > 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <label className="text-xs text-gray-500 dark:text-gray-400">4-Week Lead Velocity</label>
        {hasData && (
          <div className={`flex items-center gap-1 text-xs font-semibold ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            {trendPct !== null ? `${trendPct > 0 ? "+" : ""}${trendPct}%` : "—"}
          </div>
        )}
      </div>

      {hasData ? (
        <div className="h-20">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={weeks} margin={{ top: 4, right: 4, bottom: 4, left: 4 }}>
              {target && (
                <ReferenceLine y={target} stroke="#3b82f6" strokeDasharray="3 3" strokeWidth={1} />
              )}
              <Tooltip
                contentStyle={{ background: "#1e293b", border: "none", borderRadius: 8, fontSize: 11, color: "#f1f5f9" }}
                formatter={(v) => [`${v} leads`, ""]}
                labelStyle={{ color: "#94a3b8" }}
              />
              <Line
                type="monotone"
                dataKey="leads"
                stroke={lineColor}
                strokeWidth={2}
                dot={{ fill: lineColor, r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-20 flex items-center justify-center text-xs text-gray-400">
          No lead data yet
        </div>
      )}

      {target && (
        <p className="text-[10px] text-blue-400 mt-1">— Target: {target}/wk</p>
      )}
    </div>
  );
}
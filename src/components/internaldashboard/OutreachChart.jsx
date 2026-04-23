import { AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import { format, parseISO } from "date-fns";

export default function OutreachChart({ chartData }) {
  if (!chartData || chartData.length === 0) {
    return <p className="text-xs text-gray-400 italic py-4 text-center">No chart data available.</p>;
  }

  const formatted = chartData.map(d => ({
    ...d,
    label: format(parseISO(d.date), "MMM d"),
  }));

  // Single data point — show a bar chart with labeled metrics instead of a broken line
  if (formatted.length === 1) {
    const d = formatted[0];
    const barData = [
      { name: "Connection Requests", value: d.connections, color: "#6366f1" },
      { name: "InMails Sent", value: d.inmails, color: "#10b981" },
      { name: "Conn. Accepted", value: d.connectionsAccepted || 0, color: "#a78bfa" },
    ];

    return (
      <div className="flex flex-col items-center gap-3 py-4">
        <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">{d.label}</span>
        <div className="flex gap-6">
          {barData.map(item => (
            <div key={item.name} className="flex flex-col items-center gap-1">
              <span className="text-lg font-bold" style={{ color: item.color }}>
                {item.value.toLocaleString()}
              </span>
              <div
                className="rounded-full"
                style={{
                  width: "32px",
                  height: `${Math.max(8, (item.value / Math.max(...barData.map(b => b.value), 1)) * 80)}px`,
                  backgroundColor: item.color,
                  opacity: 0.85,
                }}
              />
              <span className="text-[10px] text-gray-500 dark:text-gray-400 text-center max-w-[80px]">{item.name}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Multi-day — area chart
  return (
    <ResponsiveContainer width="100%" height={200}>
      <AreaChart data={formatted} margin={{ top: 5, right: 10, left: -15, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <Tooltip />
        <Legend iconSize={8} wrapperStyle={{ fontSize: 10 }} />
        <Area type="monotone" dataKey="connections" name="Connections" stroke="#6366f1" fill="#6366f1" fillOpacity={0.15} strokeWidth={2} />
        <Area type="monotone" dataKey="inmails" name="InMails" stroke="#10b981" fill="#10b981" fillOpacity={0.15} strokeWidth={2} />
        <Area type="monotone" dataKey="connectionsAccepted" name="Accepted" stroke="#a78bfa" fill="#a78bfa" fillOpacity={0.1} strokeWidth={1.5} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
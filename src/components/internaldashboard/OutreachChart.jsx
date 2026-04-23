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

  // Single data point — use a proper Recharts BarChart
  if (formatted.length === 1) {
    const d = formatted[0];
    const barData = [
      { name: "Conn. Requests", value: d.connections },
      { name: "InMails Sent", value: d.inmails },
      { name: "Conn. Accepted", value: d.connectionsAccepted || 0 },
    ];
    const COLORS = ["#6366f1", "#10b981", "#a78bfa"];

    return (
      <ResponsiveContainer width="100%" height={220}>
        <BarChart data={barData} margin={{ top: 10, right: 10, left: -5, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} vertical={false} />
          <XAxis dataKey="name" tick={{ fontSize: 10 }} />
          <YAxis tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v) => v.toLocaleString()} />
          <Bar dataKey="value" name={d.label} radius={[4, 4, 0, 0]} barSize={48}>
            {barData.map((_, i) => (
              <Cell key={i} fill={COLORS[i]} fillOpacity={0.85} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
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
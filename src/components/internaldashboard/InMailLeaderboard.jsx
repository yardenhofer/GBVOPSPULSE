import { Mail, Link } from "lucide-react";

export default function InMailLeaderboard({ accounts, days }) {
  // Show ALL accounts, sorted by InMails desc, then connections desc
  const sorted = [...accounts].sort((a, b) => b.inmails - a.inmails || b.connections - a.connections);

  const maxInmails = Math.max(...sorted.map(a => a.inmails), 1);
  const maxConn = Math.max(...sorted.map(a => a.connections), 1);

  if (sorted.length === 0) {
    return (
      <p className="text-xs text-gray-400 italic py-4 text-center">
        No senders found.
      </p>
    );
  }

  return (
    <div className="space-y-1.5">
      {sorted.map((acc, i) => (
        <div key={acc.id || i} className="flex items-center gap-2 text-xs">
          <span className="w-4 text-gray-400 text-right shrink-0">{i + 1}</span>
          <span className="w-28 truncate font-medium text-gray-700 dark:text-gray-300 shrink-0">{acc.name}</span>

          {/* InMail bar */}
          <div className="flex-1 flex items-center gap-1">
            <Mail className="w-3 h-3 text-emerald-500 shrink-0" />
            <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(acc.inmails / maxInmails) * 100}%` }} />
            </div>
            <span className="w-8 text-right text-gray-600 dark:text-gray-400">{acc.inmails}</span>
          </div>

          {/* Connection bar */}
          <div className="flex-1 flex items-center gap-1">
            <Link className="w-3 h-3 text-indigo-500 shrink-0" />
            <div className="flex-1 bg-gray-100 dark:bg-gray-800 rounded-full h-2 overflow-hidden">
              <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${(acc.connections / maxConn) * 100}%` }} />
            </div>
            <span className="w-8 text-right text-gray-600 dark:text-gray-400">{acc.connections}</span>
          </div>
        </div>
      ))}

      {/* Legend */}
      <div className="flex gap-4 pt-1 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><Mail className="w-2.5 h-2.5 text-emerald-500" /> InMails</span>
        <span className="flex items-center gap-1"><Link className="w-2.5 h-2.5 text-indigo-500" /> Connections</span>
      </div>
    </div>
  );
}
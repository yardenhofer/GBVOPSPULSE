export default function ClientTableHeader() {
  return (
    <div className="hidden lg:grid grid-cols-[1fr_80px_100px_70px_80px_90px_80px_70px_auto] gap-3 px-4 pb-1">
      {["Client / AM", "Package", "Status", "LList Seq %", "Leads (wk)", "Sentiment", "Touchpoint", "Awaiting Leads", "Flags"].map(h => (
        <p key={h} className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{h}</p>
      ))}
    </div>
  );
}
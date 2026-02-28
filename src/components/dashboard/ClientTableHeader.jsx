export default function ClientTableHeader() {
  return (
    <div className="hidden lg:grid grid-cols-[200px_90px_120px_80px_100px_90px_90px_90px_auto] gap-4 px-4 pb-1">
      {["Client / AM", "Package", "Status", "LList Seq %", "Leads (wk)", "Sentiment", "Touchpoint", "Awaiting Leads", "Flags"].map(h => (
        <p key={h} className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider">{h}</p>
      ))}
    </div>
  );
}
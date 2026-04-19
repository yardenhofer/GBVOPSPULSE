import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";

export default function ScalesendsSettings({ settings, onToggle }) {
  if (!settings) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Scalesends Settings</h4>

      {/* Auto-submit toggle */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-submit to Scalesends</p>
          <p className="text-xs text-gray-400">When ON, tenants are sent to Scalesends as soon as credentials are captured. When OFF, tenants sit in the queue awaiting manual action.</p>
        </div>
        <button onClick={() => onToggle("scalesends_auto_submit")}
          className={`relative w-10 h-5 rounded-full transition-colors ${settings.autoSubmit ? "bg-blue-600" : "bg-gray-300 dark:bg-gray-600"}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.autoSubmit ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Kill switch */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-red-500">Kill Switch (Pause All Submissions)</p>
          <p className="text-xs text-gray-400">When ON, blocks all auto and manual submissions. Already-submitted jobs continue to be monitored.</p>
        </div>
        <button onClick={() => onToggle("pause_scalesends")}
          className={`relative w-10 h-5 rounded-full transition-colors ${settings.pauseScalesends ? "bg-red-600" : "bg-gray-300 dark:bg-gray-600"}`}>
          <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${settings.pauseScalesends ? "translate-x-5" : "translate-x-0.5"}`} />
        </button>
      </div>

      {/* Status indicators */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-xs">
          {settings.apiKeyConfigured ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
          <span className="text-gray-600 dark:text-gray-400">API Key: {settings.apiKeyConfigured ? "Configured" : "Not configured"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {settings.baseUrlConfigured ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <AlertTriangle className="w-3.5 h-3.5 text-yellow-500" />}
          <span className="text-gray-600 dark:text-gray-400">Base URL: {settings.baseUrlConfigured ? "Configured" : "Pending docs"}</span>
        </div>
        <div className="text-xs text-gray-500">Daily cap: {settings.dailyCap}</div>
        <div className="text-xs text-gray-500">Today: {settings.todaySubmissions} submissions</div>
      </div>
    </div>
  );
}
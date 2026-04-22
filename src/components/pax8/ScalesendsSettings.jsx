import { CheckCircle2, XCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export default function ScalesendsSettings({ settings, onToggle }) {
  if (!settings) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
      <h4 className="text-sm font-semibold text-gray-900 dark:text-white">Scalesends Settings</h4>

      {/* Porkbun workaround flag */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Use Scalesends Autofix (disable Porkbun workaround)</p>
          <p className="text-xs text-gray-400">When ON, Scalesends handles nameserver setup directly (no Porkbun calls). When OFF, our Porkbun workaround applies nameservers.</p>
        </div>
        <Switch
          checked={settings.useScalesendsAutofix}
          onCheckedChange={() => onToggle("use_scalesends_autofix")}
        />
      </div>

      {/* Auto-submit toggle */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto-submit to Scalesends</p>
          <p className="text-xs text-gray-400">When ON, tenants are sent to Scalesends as soon as credentials are captured. When OFF, tenants sit in the queue awaiting manual action.</p>
        </div>
        <Switch
          checked={settings.autoSubmit}
          onCheckedChange={() => onToggle("scalesends_auto_submit")}
        />
      </div>

      {/* Kill switch */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex-1">
          <p className="text-sm font-medium text-red-500">Kill Switch (Pause All Submissions)</p>
          <p className="text-xs text-gray-400">When ON, blocks all auto and manual submissions. Already-submitted jobs continue to be monitored.</p>
        </div>
        <Switch
          checked={settings.pauseScalesends}
          onCheckedChange={() => onToggle("pause_scalesends")}
        />
      </div>

      {/* Status indicators */}
      <div className="grid grid-cols-2 gap-3 pt-2 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2 text-xs">
          {settings.apiKeyConfigured ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
          <span className="text-gray-600 dark:text-gray-400">API Key: {settings.apiKeyConfigured ? "Configured" : "Not configured"}</span>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {settings.baseUrlConfigured ? <CheckCircle2 className="w-3.5 h-3.5 text-green-500" /> : <XCircle className="w-3.5 h-3.5 text-red-500" />}
          <span className="text-gray-600 dark:text-gray-400">Customer ID: {settings.baseUrlConfigured ? "Configured" : "Not configured"}</span>
        </div>
        <div className="text-xs text-gray-500">Daily cap: {settings.dailyCap}</div>
        <div className="text-xs text-gray-500">Today: {settings.todaySubmissions} submissions</div>
      </div>
    </div>
  );
}
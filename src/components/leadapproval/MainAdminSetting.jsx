import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { UserCheck, Loader2, Check } from "lucide-react";

export default function MainAdminSetting() {
  const [email, setEmail] = useState("");
  const [settingId, setSettingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    base44.entities.AppSettings.filter({ key: "lead_list_main_admin" }).then(settings => {
      if (settings.length > 0) {
        setEmail(settings[0].value);
        setSettingId(settings[0].id);
      }
      setLoading(false);
    });
  }, []);

  async function handleSave() {
    setSaving(true);
    if (settingId) {
      await base44.entities.AppSettings.update(settingId, { value: email.trim() });
    } else {
      const created = await base44.entities.AppSettings.create({ key: "lead_list_main_admin", value: email.trim() });
      setSettingId(created.id);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (loading) return null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <UserCheck className="w-4 h-4 text-purple-400" />
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Lead List Approval Notifications</h3>
      </div>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
        This admin will receive email + Slack alerts when a new lead list is submitted for review.
      </p>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="admin@yourcompany.com"
          className="flex-1 text-sm px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button onClick={handleSave} disabled={saving || !email.trim()}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium transition-colors disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : saved ? <Check className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
          {saved ? "Saved" : "Save"}
        </button>
      </div>
    </div>
  );
}
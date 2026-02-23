import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ShieldAlert } from "lucide-react";

const PLAN_STATUSES = ["Pending", "In Progress", "Resolved"];
const STATUS_COLORS = {
  Pending: "text-red-400 bg-red-500/10",
  "In Progress": "text-yellow-400 bg-yellow-500/10",
  Resolved: "text-green-400 bg-green-500/10",
};

export default function RecoveryPlanSection({ client }) {
  const [plan, setPlan] = useState(null);
  const [text, setText] = useState("");
  const [planStatus, setPlanStatus] = useState("Pending");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    base44.entities.RecoveryPlan.filter({ client_id: client.id }, "-created_date", 1)
      .then(res => {
        if (res[0]) {
          setPlan(res[0]);
          setText(res[0].plan);
          setPlanStatus(res[0].status);
        }
      });
  }, [client.id]);

  async function handleSave() {
    setSaving(true);
    if (plan?.id) {
      await base44.entities.RecoveryPlan.update(plan.id, { plan: text, status: planStatus });
      setPlan(p => ({ ...p, plan: text, status: planStatus }));
    } else {
      const created = await base44.entities.RecoveryPlan.create({
        client_id: client.id,
        plan: text,
        status: planStatus,
        submitted_date: new Date().toISOString().slice(0, 10),
      });
      setPlan(created);
    }
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-red-500/20 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Recovery Plan</h3>
          <span className="text-xs text-gray-400">(required for Critical clients)</span>
        </div>
        <div className="flex items-center gap-2">
          {saved && <span className="text-xs text-green-400">Saved ✓</span>}
          <button
            onClick={handleSave}
            disabled={saving || !text.trim()}
            className="text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save Plan"}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-3">
        {PLAN_STATUSES.map(s => (
          <button
            key={s}
            onClick={() => setPlanStatus(s)}
            className={`text-xs font-medium px-2.5 py-1 rounded-lg border transition-all
              ${planStatus === s ? `${STATUS_COLORS[s]} border-current` : "border-gray-200 dark:border-gray-700 text-gray-500"}`}
          >
            {s}
          </button>
        ))}
      </div>

      <textarea
        value={text}
        onChange={e => setText(e.target.value)}
        rows={4}
        placeholder="Outline the recovery plan for this client. What actions are being taken? What is the timeline? Who is responsible?"
        className="w-full text-sm px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
      />
    </div>
  );
}
import { useState, useEffect } from "react";
import { differenceInDays, format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { ListChecks, Calendar, Clock } from "lucide-react";

const STATUSES = ["Ready", "Waiting on Data", "Being Built", "QA Review", "Live"];
const STATUS_COLORS = {
  "Ready": "text-green-400 bg-green-500/10",
  "Waiting on Data": "text-yellow-400 bg-yellow-500/10",
  "Being Built": "text-blue-400 bg-blue-500/10",
  "QA Review": "text-purple-400 bg-purple-500/10",
  "Live": "text-emerald-400 bg-emerald-500/10",
};

export default function LeadFlowSection({ client }) {
  const [leadList, setLeadList] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.entities.LeadList.filter({ client_id: client.id }, "-updated_date", 1)
      .then(res => setLeadList(res[0] || null));
  }, [client.id]);

  async function handleChange(field, value) {
    setSaving(true);
    const updated = { ...leadList, [field]: value, client_id: client.id };
    if (leadList?.id) {
      await base44.entities.LeadList.update(leadList.id, { [field]: value });
    } else {
      const created = await base44.entities.LeadList.create(updated);
      setLeadList(created);
      setSaving(false);
      return;
    }
    setLeadList(updated);
    setSaving(false);
  }

  const waitingDays = leadList?.date_uploaded
    ? differenceInDays(new Date(), new Date(leadList.date_uploaded))
    : null;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center gap-2 mb-4">
        <ListChecks className="w-4 h-4 text-blue-400" />
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Lead Flow</h3>
        {saving && <span className="text-xs text-gray-400 ml-auto">Saving…</span>}
      </div>

      <div className="space-y-3">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">List Status</label>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map(s => (
              <button
                key={s}
                onClick={() => handleChange("status", s)}
                className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-all border
                  ${leadList?.status === s
                    ? `${STATUS_COLORS[s]} border-current`
                    : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
              >
                {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
              <Calendar className="w-3 h-3" /> Last Uploaded
            </label>
            <input
              type="date"
              value={leadList?.date_uploaded || ""}
              onChange={e => handleChange("date_uploaded", e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mb-1">
              <Calendar className="w-3 h-3" /> Expected Next
            </label>
            <input
              type="date"
              value={leadList?.expected_next_date || ""}
              onChange={e => handleChange("expected_next_date", e.target.value)}
              className="w-full text-sm px-2 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {waitingDays !== null && waitingDays > 0 && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium
            ${waitingDays >= 4 ? "bg-red-500/10 text-red-400" : waitingDays >= 2 ? "bg-yellow-500/10 text-yellow-400" : "bg-gray-100 dark:bg-gray-800 text-gray-500"}`}>
            <Clock className="w-3.5 h-3.5" />
            {waitingDays >= 2 ? `⚠ ${waitingDays} days since last upload` : `${waitingDays} day since last upload`}
          </div>
        )}
      </div>
    </div>
  );
}
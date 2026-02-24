import { useState, useEffect } from "react";
import { format } from "date-fns";
import { base44 } from "@/api/base44Client";
import { Clock, Phone, Mail, Slack, Lightbulb, AlertCircle, MessageSquare, Settings, TrendingUp, Flag } from "lucide-react";

const TYPE_CONFIG = {
  Call:           { icon: Phone,        color: "text-green-400 bg-green-500/10",   label: "Call" },
  Email:          { icon: Mail,         color: "text-blue-400 bg-blue-500/10",     label: "Email" },
  Slack:          { icon: Slack,        color: "text-purple-400 bg-purple-500/10", label: "Slack" },
  Strategy:       { icon: Lightbulb,    color: "text-cyan-400 bg-cyan-500/10",     label: "Strategy" },
  Issue:          { icon: AlertCircle,  color: "text-red-400 bg-red-500/10",       label: "Issue" },
  status_change:  { icon: TrendingUp,   color: "text-yellow-400 bg-yellow-500/10", label: "Status Change" },
  sentiment_change:{ icon: MessageSquare, color: "text-pink-400 bg-pink-500/10",   label: "Sentiment" },
  escalation:     { icon: Flag,         color: "text-red-400 bg-red-500/10",       label: "Escalation" },
  settings_update:{ icon: Settings,     color: "text-gray-400 bg-gray-500/10",     label: "Update" },
  note:           { icon: MessageSquare, color: "text-blue-400 bg-blue-500/10",    label: "Note" },
};

export default function ActivityTimeline({ client }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const [activityLogs, timelineEvents] = await Promise.all([
        base44.entities.ActivityLog.filter({ client_id: client.id }, "-date", 50),
        base44.entities.TimelineEvent.filter({ client_id: client.id }, "-date", 50),
      ]);

      // Merge and sort by date desc
      const merged = [
        ...activityLogs.map(l => ({
          id: `act-${l.id}`,
          date: l.date,
          type: l.type,
          title: l.type,
          detail: l.note,
          meta: l.follow_up_needed ? "Follow-up needed" : null,
          am: l.am_email,
        })),
        ...timelineEvents.map(e => ({
          id: `tl-${e.id}`,
          date: e.date,
          type: e.type,
          title: e.title,
          detail: e.detail,
          oldVal: e.old_value,
          newVal: e.new_value,
          am: e.am_email,
        })),
      ].sort((a, b) => new Date(b.date) - new Date(a.date));

      setEvents(merged);
      setLoading(false);
    }
    load();
  }, [client.id]);

  if (loading) return (
    <div className="space-y-2">
      {Array(3).fill(0).map((_, i) => <div key={i} className="h-12 rounded-lg bg-gray-200 dark:bg-gray-800 animate-pulse" />)}
    </div>
  );

  if (events.length === 0) return (
    <p className="text-xs text-gray-400 text-center py-6">No timeline events yet.</p>
  );

  return (
    <div className="relative">
      {/* Vertical line */}
      <div className="absolute left-3.5 top-0 bottom-0 w-px bg-gray-200 dark:bg-gray-700" />

      <div className="space-y-3 max-h-96 overflow-y-auto pr-1 pl-1">
        {events.map(ev => {
          const cfg = TYPE_CONFIG[ev.type] || TYPE_CONFIG.note;
          const Icon = cfg.icon;
          return (
            <div key={ev.id} className="flex gap-3 relative">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 z-10 ${cfg.color}`}>
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="flex-1 min-w-0 pb-3 border-b border-gray-100 dark:border-gray-800 last:border-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">{ev.title}</span>
                  {ev.oldVal && ev.newVal && (
                    <span className="text-[10px] text-gray-400">
                      <span className="line-through">{ev.oldVal}</span> → <span className="font-medium text-gray-600 dark:text-gray-300">{ev.newVal}</span>
                    </span>
                  )}
                  {ev.meta && <span className="text-[10px] bg-orange-500/10 text-orange-400 px-1.5 rounded">{ev.meta}</span>}
                </div>
                {ev.detail && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{ev.detail}</p>}
                <div className="flex items-center gap-2 mt-1">
                  <Clock className="w-3 h-3 text-gray-300 dark:text-gray-600" />
                  <span className="text-[10px] text-gray-400">
                    {ev.date ? format(new Date(ev.date), "MMM d, yyyy") : ""}
                    {ev.am ? ` · ${ev.am.split("@")[0]}` : ""}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
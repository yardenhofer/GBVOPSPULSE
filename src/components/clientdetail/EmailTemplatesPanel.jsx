import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Mail, Send, ChevronDown, Loader2 } from "lucide-react";

const TEMPLATES = [
  { key: "weekly_update",    label: "Weekly Update",      desc: "Lead stats + feedback summary" },
  { key: "check_in",         label: "Check-In",           desc: "Friendly touch base" },
  { key: "escalation_update",label: "Escalation Update",  desc: "Address concerns, schedule call" },
  { key: "lead_list_delay",  label: "Lead List Delay",    desc: "Proactive delay notification" },
];

export default function EmailTemplatesPanel({ client }) {
  const [toEmail, setToEmail] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleSend() {
    if (!toEmail.trim() || !selectedTemplate) return;
    setSending(true);
    await base44.functions.invoke("sendClientEmail", {
      client_id: client.id,
      template: selectedTemplate,
      to_email: toEmail.trim(),
    });
    setSending(false);
    setSent(true);
    setToEmail("");
    setSelectedTemplate(null);
    setTimeout(() => setSent(false), 3000);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between"
      >
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Email Templates</h3>
        </div>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            {TEMPLATES.map(t => (
              <button
                key={t.key}
                onClick={() => setSelectedTemplate(t.key)}
                className={`text-left p-2.5 rounded-lg border text-xs transition-all
                  ${selectedTemplate === t.key
                    ? "border-blue-500 bg-blue-500/5 text-blue-400"
                    : "border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600"
                  }`}
              >
                <div className="font-semibold">{t.label}</div>
                <div className="text-gray-400 mt-0.5">{t.desc}</div>
              </button>
            ))}
          </div>

          <input
            type="email"
            placeholder="Send to (client email)..."
            value={toEmail}
            onChange={e => setToEmail(e.target.value)}
            className="w-full text-sm px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border-0 focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
          />

          <button
            onClick={handleSend}
            disabled={!toEmail.trim() || !selectedTemplate || sending}
            className="w-full flex items-center justify-center gap-2 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-40"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sent ? "Sent!" : sending ? "Sending…" : "Send Email"}
          </button>
        </div>
      )}
    </div>
  );
}
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Mail, Save, History, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";

export default function EmailSequenceSection({ client, onClientUpdate }) {
  const [copy, setCopy] = useState(client.email_copy || "");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [logs, setLogs] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [user, setUser] = useState(null);

  const hasChanges = copy !== (client.email_copy || "");

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  useEffect(() => {
    if (showHistory) loadLogs();
  }, [showHistory]);

  async function loadLogs() {
    const data = await base44.entities.EmailCopyLog.filter(
      { client_id: client.id }, "-created_date", 20
    );
    setLogs(data);
  }

  async function save() {
    setSaving(true);
    const previousCopy = client.email_copy || "";

    // Log the change if there was previous content
    if (previousCopy.trim()) {
      await base44.entities.EmailCopyLog.create({
        client_id: client.id,
        previous_copy: previousCopy,
        new_copy: copy,
        changed_by: user?.email || "unknown",
      });
    }

    await base44.entities.Client.update(client.id, { email_copy: copy });
    onClientUpdate({ email_copy: copy });
    setSaving(false);
    setSaved(true);
    if (showHistory) loadLogs();
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Mail className="w-4 h-4 text-blue-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Email Sequence Copy</h3>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <button
              onClick={save}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-medium transition-colors disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving…" : saved ? "Saved!" : "Save Changes"}
            </button>
          )}
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          >
            <History className="w-3.5 h-3.5" />
            History
            {showHistory ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          </button>
        </div>
      </div>

      <textarea
        value={copy}
        onChange={e => setCopy(e.target.value)}
        placeholder="Paste the client's current email sequence copy here for reference..."
        rows={8}
        className="w-full px-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-blue-500 resize-y font-mono leading-relaxed"
      />

      {showHistory && (
        <div className="mt-4 border-t border-gray-100 dark:border-gray-800 pt-3">
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Change History</p>
          {logs.length === 0 ? (
            <p className="text-xs text-gray-400">No changes recorded yet.</p>
          ) : (
            <div className="space-y-3 max-h-64 overflow-y-auto">
              {logs.map(log => (
                <div key={log.id} className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-300">
                      {log.changed_by || "Unknown"}
                    </span>
                    <span className="text-xs text-gray-400">
                      {format(new Date(log.created_date), "MMM d, yyyy h:mm a")}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div>
                      <span className="text-[10px] font-semibold text-red-400 uppercase">Previous</span>
                      <pre className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap mt-0.5 max-h-24 overflow-y-auto bg-red-500/5 rounded p-2">
                        {log.previous_copy}
                      </pre>
                    </div>
                    <div>
                      <span className="text-[10px] font-semibold text-green-400 uppercase">Updated to</span>
                      <pre className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-wrap mt-0.5 max-h-24 overflow-y-auto bg-green-500/5 rounded p-2">
                        {log.new_copy}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
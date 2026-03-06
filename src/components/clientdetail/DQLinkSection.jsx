import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { FileText, ExternalLink, Check, Pencil } from "lucide-react";

export default function DQLinkSection({ client, onClientUpdate }) {
  const [editing, setEditing] = useState(false);
  const [link, setLink] = useState(client.dq_link || "");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await base44.entities.Client.update(client.id, { dq_link: link.trim() });
    onClientUpdate({ dq_link: link.trim() });
    setSaving(false);
    setEditing(false);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-violet-400" />
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Discovery Questionnaire</h3>
        </div>
        {!editing && (
          <button onClick={() => setEditing(true)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
            <Pencil className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {editing ? (
        <div className="flex gap-2">
          <input
            type="url"
            value={link}
            onChange={e => setLink(e.target.value)}
            placeholder="https://docs.google.com/forms/..."
            className="flex-1 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-violet-500"
            autoFocus
          />
          <button
            onClick={save}
            disabled={saving}
            className="px-3 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors disabled:opacity-50"
          >
            <Check className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setEditing(false); setLink(client.dq_link || ""); }}
            className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-500 text-sm hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : client.dq_link ? (
        <a
          href={client.dq_link}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-violet-500 hover:text-violet-400 transition-colors"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          Open Questionnaire
        </a>
      ) : (
        <p className="text-sm text-gray-400 dark:text-gray-500">No DQ link set yet. Click the pencil to add one.</p>
      )}
    </div>
  );
}
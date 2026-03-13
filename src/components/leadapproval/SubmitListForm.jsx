import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Link as LinkIcon, FileText, Loader2, X, ChevronsUpDown, Check, Search } from "lucide-react";

function ClientCombobox({ clients, value, onChange }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const inputRef = useRef(null);

  const selected = clients.find(c => c.id === value);
  const filtered = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase())
  );

  useEffect(() => {
    function handleClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  useEffect(() => {
    if (open && inputRef.current) inputRef.current.focus();
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Client *</label>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 text-sm px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-left border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
      >
        <span className={selected ? "text-gray-900 dark:text-gray-100" : "text-gray-400"}>
          {selected ? selected.name : "Search and select a client…"}
        </span>
        <ChevronsUpDown className="w-3.5 h-3.5 text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <Search className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Type to search…"
              className="flex-1 text-sm bg-transparent text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-3 py-3 text-xs text-gray-400 text-center">No clients found</p>
            ) : (
              filtered.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { onChange(c.id); setOpen(false); setSearch(""); }}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition-colors hover:bg-blue-50 dark:hover:bg-blue-500/10 ${
                    c.id === value ? "bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400" : "text-gray-700 dark:text-gray-300"
                  }`}
                >
                  {c.id === value && <Check className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                  <span className={c.id === value ? "" : "ml-5"}>{c.name}</span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function SubmitListForm({ clients, user, onSubmitted }) {
  const [clientId, setClientId] = useState("");
  const [listName, setListName] = useState("");
  const [listType, setListType] = useState("file");
  const [file, setFile] = useState(null);
  const [linkUrl, setLinkUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [leadCount, setLeadCount] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileUrl, setFileUrl] = useState("");

  const selectedClient = clients.find(c => c.id === clientId);

  async function handleFileChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setUploading(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file: f });
    setFileUrl(file_url);
    setUploading(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!clientId || !listName) return;
    if (listType === "file" && !fileUrl) return;
    if (listType === "link" && !linkUrl.trim()) return;

    setSubmitting(true);
    try {
      await base44.entities.LeadListApproval.create({
        client_id: clientId,
        client_name: selectedClient?.name || "",
        submitted_by: user.email,
        submitted_by_name: user.full_name || user.email,
        list_name: listName,
        list_type: listType,
        file_url: listType === "file" ? fileUrl : null,
        link_url: listType === "link" ? linkUrl.trim() : null,
        notes: notes.trim() || null,
        lead_count: leadCount ? Number(leadCount) : null,
        status: "Pending",
      });
      // Reset
      setClientId("");
      setListName("");
      setFile(null);
      setFileUrl("");
      setLinkUrl("");
      setNotes("");
      setLeadCount("");
      onSubmitted();
    } finally {
      setSubmitting(false);
    }
  }

  const inputCls = "w-full text-sm px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100 border border-gray-200 dark:border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500";

  const isValid = clientId && listName && (listType === "file" ? !!fileUrl : !!linkUrl.trim());

  return (
    <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
      <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
        <FileText className="w-4 h-4 text-blue-400" />
        Submit Lead List for Approval
      </h3>

      {/* Client dropdown — filter by AM's group for non-admins */}
      <ClientCombobox
        clients={clients.filter(c =>
          c.status !== "Terminated" &&
          (user?.role === "admin" || !user?.group || c.group === user.group)
        )}
        value={clientId}
        onChange={setClientId}
      />

      {/* List name */}
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">List Name *</label>
        <input type="text" value={listName} onChange={e => setListName(e.target.value)} required
          placeholder="e.g. Q1 SaaS CTO List" className={inputCls} />
      </div>

      {/* Type toggle */}
      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">List Type</label>
        <div className="flex gap-2">
          <button type="button" onClick={() => setListType("file")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${listType === "file" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}>
            <Upload className="w-3.5 h-3.5" /> CSV Upload
          </button>
          <button type="button" onClick={() => setListType("link")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${listType === "link" ? "bg-blue-600 text-white" : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"}`}>
            <LinkIcon className="w-3.5 h-3.5" /> External Link
          </button>
        </div>
      </div>

      {/* File or link input */}
      {listType === "file" ? (
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Upload CSV *</label>
          {file ? (
            <div className="flex items-center gap-2 bg-green-50 dark:bg-green-500/10 border border-green-200 dark:border-green-500/20 rounded-lg px-3 py-2">
              <FileText className="w-4 h-4 text-green-500 shrink-0" />
              <span className="text-sm text-green-700 dark:text-green-400 truncate flex-1">{file.name}</span>
              {uploading ? <Loader2 className="w-4 h-4 animate-spin text-green-500" /> : (
                <button type="button" onClick={() => { setFile(null); setFileUrl(""); }}
                  className="text-gray-400 hover:text-red-500">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ) : (
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileChange} className={inputCls} />
          )}
        </div>
      ) : (
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Link URL *</label>
          <input type="url" value={linkUrl} onChange={e => setLinkUrl(e.target.value)} required={listType === "link"}
            placeholder="https://docs.google.com/spreadsheets/..." className={inputCls} />
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Approx. Lead Count</label>
          <input type="number" value={leadCount} onChange={e => setLeadCount(e.target.value)}
            placeholder="e.g. 500" className={inputCls} />
        </div>
      </div>

      <div>
        <label className="text-xs text-gray-500 dark:text-gray-400 block mb-1">Notes for Reviewer</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
          placeholder="Explain targeting criteria, ICP match, etc…"
          className={inputCls + " resize-none"} />
      </div>

      <button type="submit" disabled={submitting || uploading || !isValid}
        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors disabled:opacity-50">
        {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
        {submitting ? "Submitting…" : "Submit for Approval"}
      </button>
    </form>
  );
}
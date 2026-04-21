import { useState, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Upload, Trash2, Users, RefreshCw, AlertCircle } from "lucide-react";

export default function InboxNamePool() {
  const [names, setNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const fileRef = useRef(null);

  async function loadNames() {
    setLoading(true);
    setError(null);
    try {
      const res = await base44.functions.invoke("scalesendsSubmit", { action: "getNamePool" });
      setNames(res.data.names || []);
    } catch (err) {
      console.error("Failed to load name pool:", err);
      setError("Failed to load name pool.");
    }
    setLoading(false);
  }

  useEffect(() => { loadNames(); }, []);

  function parseCsv(text) {
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return [];
    
    // Detect header
    const headerLine = lines[0].toLowerCase();
    let firstIdx = 0, lastIdx = 1;
    if (headerLine.includes("first") || headerLine.includes("last") || headerLine.includes("name")) {
      const cols = lines[0].split(",").map(c => c.trim().toLowerCase());
      firstIdx = cols.findIndex(c => c.includes("first"));
      lastIdx = cols.findIndex(c => c.includes("last"));
      if (firstIdx === -1) firstIdx = 0;
      if (lastIdx === -1) lastIdx = 1;
      lines.shift();
    }

    return lines.map(line => {
      const parts = line.split(",").map(p => p.trim().replace(/^["']|["']$/g, ""));
      return { first_name: parts[firstIdx] || "", last_name: parts[lastIdx] || "" };
    }).filter(n => n.first_name && n.last_name);
  }

  async function handleFileSelect(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setPreview(null);
    const ext = file.name.split(".").pop().toLowerCase();

    if (ext === "csv") {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (fileRef.current) fileRef.current.value = "";
        const parsed = parseCsv(ev.target.result);
        if (parsed.length === 0) {
          setError("No names found in CSV. Make sure it has first_name and last_name columns.");
          return;
        }
        setPreview(parsed);
      };
      reader.onerror = () => {
        if (fileRef.current) fileRef.current.value = "";
        setError("Failed to read the file.");
      };
      reader.readAsText(file);
    } else if (ext === "docx") {
      setUploading(true);
      try {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        const result = await base44.integrations.Core.ExtractDataFromUploadedFile({
          file_url,
          json_schema: {
            type: "object",
            properties: {
              names: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    first_name: { type: "string" },
                    last_name: { type: "string" },
                  },
                },
              },
            },
          },
        });
        if (result.status === "success" && result.output?.names) {
          const cleaned = result.output.names.filter(n => n.first_name && n.last_name);
          if (cleaned.length === 0) {
            setError("File processed but no valid first_name/last_name pairs found.");
          } else {
            setPreview(cleaned);
          }
        } else {
          setError("Could not extract names from DOCX. Make sure it contains first and last names.");
        }
      } catch (err) {
        console.error("DOCX processing error:", err);
        setError(`DOCX processing failed: ${err.message || "Unknown error"}`);
      }
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    } else {
      setError("Please upload a .csv or .docx file.");
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleUpload() {
    if (!preview || preview.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      await base44.functions.invoke("scalesendsSubmit", { action: "uploadNamePool", names: preview });
      setPreview(null);
      await loadNames();
    } catch (err) {
      console.error("Upload failed:", err);
      setError(`Upload failed: ${err.message || "Unknown error"}`);
    }
    setUploading(false);
  }

  async function handleClear() {
    if (!confirm("Clear all inbox names from the pool?")) return;
    setError(null);
    try {
      await base44.functions.invoke("scalesendsSubmit", { action: "clearNamePool" });
      await loadNames();
    } catch (err) {
      setError(`Clear failed: ${err.message || "Unknown error"}`);
    }
  }

  function generateSample() {
    if (names.length === 0) return "No names loaded";
    const shuffled = [...names].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, Math.min(10, shuffled.length)).map(n => `${n.first_name} ${n.last_name}`).join(", ");
  }

  return (
    <div className="border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" />
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Inbox Name Pool</h3>
          <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-0.5 rounded-full">
            {loading ? "…" : `${names.length} names`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 cursor-pointer font-medium">
            <Upload className="w-3 h-3" /> Upload CSV / DOCX
            <input type="file" accept=".csv,.docx" className="hidden" onChange={handleFileSelect} ref={fileRef} />
          </label>
          {names.length > 0 && (
            <button onClick={handleClear}
              className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-red-100 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-200 font-medium">
              <Trash2 className="w-3 h-3" /> Clear
            </button>
          )}
        </div>
      </div>

      <p className="text-xs text-gray-500">
        Upload a CSV (with <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">first_name</code>, <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">last_name</code> columns) or a DOCX with names. 100 random names will be selected per Scalesends order.
      </p>

      {/* Error display */}
      {error && (
        <div className="bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 rounded-lg p-2.5 flex items-start gap-2">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
          <span className="text-xs text-red-600 dark:text-red-400">{error}</span>
        </div>
      )}

      {/* Uploading/processing indicator */}
      {uploading && !preview && (
        <div className="flex items-center gap-2 py-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-500" />
          <span className="text-xs text-blue-600 dark:text-blue-400">Processing file…</span>
        </div>
      )}

      {/* Preview before upload */}
      {preview && (
        <div className="bg-blue-50 dark:bg-blue-500/5 border border-blue-200 dark:border-blue-500/20 rounded-lg p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-700 dark:text-blue-400">
              Preview: {preview.length} names parsed
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPreview(null)}
                className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300">
                Cancel
              </button>
              <button onClick={handleUpload} disabled={uploading}
                className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                {uploading ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                Replace Pool ({preview.length} names)
              </button>
            </div>
          </div>
          <div className="max-h-32 overflow-y-auto text-xs text-gray-600 dark:text-gray-400 space-y-0.5">
            {preview.slice(0, 20).map((n, i) => (
              <div key={i} className="flex gap-2">
                <span className="text-gray-400 w-6 text-right">{i + 1}.</span>
                <span>{n.first_name} {n.last_name}</span>
              </div>
            ))}
            {preview.length > 20 && <div className="text-gray-400 pl-8">… and {preview.length - 20} more</div>}
          </div>
        </div>
      )}

      {/* Current pool sample */}
      {!preview && names.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-medium text-gray-600 dark:text-gray-400">Random sample (10 of {names.length}):</span>
            <button onClick={() => setNames([...names])} className="text-xs text-blue-500 hover:text-blue-600">
              <RefreshCw className="w-3 h-3" />
            </button>
          </div>
          <p className="text-xs text-gray-500">{generateSample()}</p>
        </div>
      )}
    </div>
  );
}
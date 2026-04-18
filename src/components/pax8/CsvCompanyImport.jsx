import { useState, useRef } from "react";
import { Upload, Play, CheckCircle2, XCircle, FileSpreadsheet, Trash2, Loader2 } from "lucide-react";
import { base44 } from "@/api/base44Client";

const REQUIRED_COLUMNS = ["name"];
const EXPECTED_COLUMNS = [
  "name", "address1", "address2", "city", "state", "postal_code",
  "country", "fax", "phone", "url", "number_of_employees",
  "contact_first_name", "contact_last_name", "contact_phoneNumber",
  "contact_fax", "contact_email"
];

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return { headers: [], rows: [] };

  // Detect delimiter (tab or comma)
  const firstLine = lines[0];
  const delimiter = firstLine.includes("\t") ? "\t" : ",";

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ""));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = lines[i].split(delimiter).map(v => v.trim().replace(/^"|"$/g, ""));
    const row = {};
    headers.forEach((h, idx) => { row[h] = vals[idx] || ""; });
    if (row.name) rows.push(row);
  }
  return { headers, rows };
}

export default function CsvCompanyImport() {
  const [rows, setRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [fileName, setFileName] = useState(null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState(null);
  const [currentIdx, setCurrentIdx] = useState(-1);
  const fileRef = useRef(null);

  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setResults(null);

    const reader = new FileReader();
    reader.onload = (ev) => {
      const { headers: h, rows: r } = parseCsv(ev.target.result);
      setHeaders(h);
      setRows(r);
    };
    reader.readAsText(file);
  }

  function clearFile() {
    setRows([]);
    setHeaders([]);
    setFileName(null);
    setResults(null);
    setCurrentIdx(-1);
    if (fileRef.current) fileRef.current.value = "";
  }

  const missingRequired = REQUIRED_COLUMNS.filter(c => !headers.includes(c));

  async function runImport() {
    setRunning(true);
    setResults(null);
    setCurrentIdx(0);

    // Send in batches of 10
    const batchSize = 10;
    const allResults = [];
    for (let i = 0; i < rows.length; i += batchSize) {
      const batch = rows.slice(i, i + batchSize);
      setCurrentIdx(i);
      const res = await base44.functions.invoke("pax8Auth", {
        action: "createCompanies",
        companies: batch,
      });
      if (res.data.results) {
        allResults.push(...res.data.results);
        setResults([...allResults]);
      }
    }

    setCurrentIdx(-1);
    setRunning(false);
  }

  const successCount = results?.filter(r => r.status === "success").length || 0;
  const failCount = results?.filter(r => r.status === "failed").length || 0;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
          <FileSpreadsheet className="w-4 h-4 text-purple-500" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Bulk Company Import</h3>
          <p className="text-xs text-gray-500">Upload a CSV/TSV to create new companies in Pax8</p>
        </div>
      </div>

      {/* Upload area */}
      {!fileName && (
        <label className="flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl cursor-pointer hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50/50 dark:hover:bg-purple-500/5 transition-colors">
          <Upload className="w-6 h-6 text-gray-400" />
          <span className="text-sm text-gray-500">Click to upload CSV or TSV file</span>
          <span className="text-xs text-gray-400">Required column: name</span>
          <input ref={fileRef} type="file" accept=".csv,.tsv,.txt" className="hidden" onChange={handleFile} />
        </label>
      )}

      {/* File loaded */}
      {fileName && rows.length > 0 && (
        <>
          <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800/50 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-purple-500" />
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{fileName}</span>
              <span className="text-xs text-gray-400">· {rows.length} row{rows.length !== 1 ? "s" : ""}</span>
            </div>
            <button onClick={clearFile} className="text-gray-400 hover:text-red-500 transition-colors">
              <Trash2 className="w-4 h-4" />
            </button>
          </div>

          {missingRequired.length > 0 && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400">
              Missing required columns: {missingRequired.join(", ")}
            </div>
          )}

          {/* Preview table */}
          <div className="max-h-60 overflow-auto border border-gray-200 dark:border-gray-800 rounded-lg">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 dark:bg-gray-800 sticky top-0">
                <tr>
                  <th className="px-2 py-1.5 text-left text-gray-500 font-medium">#</th>
                  {headers.map(h => (
                    <th key={h} className="px-2 py-1.5 text-left text-gray-500 font-medium whitespace-nowrap">{h}</th>
                  ))}
                  {results && <th className="px-2 py-1.5 text-left text-gray-500 font-medium">Result</th>}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const result = results?.[idx];
                  const isProcessing = running && idx === currentIdx;
                  return (
                    <tr key={idx} className={`border-t border-gray-100 dark:border-gray-800 ${isProcessing ? "bg-blue-50/50 dark:bg-blue-500/5" : ""}`}>
                      <td className="px-2 py-1.5 text-gray-400">{idx + 1}</td>
                      {headers.map(h => (
                        <td key={h} className="px-2 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[150px] truncate">{row[h]}</td>
                      ))}
                      {results && (
                        <td className="px-2 py-1.5">
                          {result ? (
                            result.status === "success" ? (
                              <span className="flex items-center gap-1 text-green-600"><CheckCircle2 className="w-3 h-3" /> Created</span>
                            ) : (
                              <span className="flex items-center gap-1 text-red-500" title={result.error}><XCircle className="w-3 h-3" /> {result.error?.slice(0, 40)}</span>
                            )
                          ) : (
                            running && idx >= currentIdx ? <Loader2 className="w-3 h-3 animate-spin text-gray-400" /> : null
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Summary after run */}
          {results && !running && (
            <div className="flex items-center gap-4 text-sm">
              <span className="text-green-600 font-medium">{successCount} created</span>
              {failCount > 0 && <span className="text-red-500 font-medium">{failCount} failed</span>}
            </div>
          )}

          {/* Run button */}
          {!results && missingRequired.length === 0 && (
            <div className="flex justify-center">
              <button
                onClick={runImport}
                disabled={running}
                className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium disabled:opacity-50 transition-colors"
              >
                {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                {running ? `Creating companies… (${currentIdx + 1}/${rows.length})` : `Create ${rows.length} Companies in Pax8`}
              </button>
            </div>
          )}
        </>
      )}

      {fileName && rows.length === 0 && (
        <div className="text-center text-sm text-gray-400 py-4">
          No valid rows found. Make sure the file has a header row with at least a "name" column.
        </div>
      )}
    </div>
  );
}
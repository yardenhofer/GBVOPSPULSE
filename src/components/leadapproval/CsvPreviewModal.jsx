import { useState, useEffect } from "react";
import { X, Download, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 50;

function parseCsv(text) {
  const rows = [];
  let cells = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuotes && text[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(current);
      current = "";
    } else if ((ch === "\n" || ch === "\r") && !inQuotes) {
      cells.push(current);
      current = "";
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (cells.length > 0) rows.push(cells);
      cells = [];
    } else {
      current += ch;
    }
  }
  if (current || cells.length) {
    cells.push(current);
    rows.push(cells);
  }
  return rows;
}

export default function CsvPreviewModal({ fileUrl, listName, onClose }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [rows, setRows] = useState([]);
  const [page, setPage] = useState(0);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(fileUrl);
        if (!res.ok) throw new Error("Failed to fetch file");
        const text = await res.text();
        const parsed = parseCsv(text);
        if (parsed.length > 0) {
          setHeaders(parsed[0]);
          setRows(parsed.slice(1).filter(r => r.some(c => c.trim())));
        }
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [fileUrl]);

  const totalPages = Math.ceil(rows.length / PAGE_SIZE);
  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl border border-gray-200 dark:border-gray-800 shadow-2xl w-full max-w-6xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-800 shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white truncate">{listName}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {rows.length} rows · {headers.length} columns
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href={fileUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white transition-colors"
            >
              <Download className="w-3 h-3" /> Download
            </a>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
              <X className="w-4 h-4 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
              <span className="ml-2 text-sm text-gray-500">Loading CSV…</span>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-20">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50 dark:bg-gray-800/80">
                  <th className="px-3 py-2 text-left text-gray-400 font-medium border-b border-gray-200 dark:border-gray-700 w-10">#</th>
                  {headers.map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left text-gray-600 dark:text-gray-300 font-semibold border-b border-gray-200 dark:border-gray-700 whitespace-nowrap">
                      {h || `Col ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-blue-50/50 dark:hover:bg-blue-500/5 transition-colors">
                    <td className="px-3 py-1.5 text-gray-400 border-b border-gray-100 dark:border-gray-800/60">
                      {page * PAGE_SIZE + ri + 1}
                    </td>
                    {headers.map((_, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 border-b border-gray-100 dark:border-gray-800/60 max-w-[250px] truncate">
                        {row[ci] || ""}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-5 py-2.5 border-t border-gray-200 dark:border-gray-800 shrink-0">
            <p className="text-xs text-gray-500">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, rows.length)} of {rows.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <span className="text-xs text-gray-500 px-2">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-800 disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
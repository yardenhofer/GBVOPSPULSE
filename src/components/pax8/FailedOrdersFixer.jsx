import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Wrench, CheckCircle, XCircle, Loader2, AlertTriangle, MapPin } from "lucide-react";

const ADDRESS_ERROR_KEYWORDS = ["city/state/postal", "address", "did not validate", "postal code", "zip code"];

function isAddressError(errorStr) {
  if (!errorStr) return false;
  const lower = errorStr.toLowerCase();
  return ADDRESS_ERROR_KEYWORDS.some(kw => lower.includes(kw));
}

export default function FailedOrdersFixer({ liveResults, inboxProvider, maxDomainRetries }) {
  const [fixing, setFixing] = useState(false);
  const [fixResults, setFixResults] = useState(null);

  const addressFailures = liveResults.filter(r => r.status === "failed" && isAddressError(r.error));

  if (addressFailures.length === 0) return null;

  async function handleFixAndRetry() {
    setFixing(true);
    setFixResults(null);

    const parsed = inboxProvider ? JSON.parse(inboxProvider) : null;

    const res = await base44.functions.invoke("pax8Auth", {
      action: "fixAddressAndRetry",
      failedClients: addressFailures.map(r => ({
        companyId: r.companyId,
        companyName: r.companyName,
        domain: r.domain || null,
      })),
      maxDomainRetries: maxDomainRetries || 5,
      inboxProviderName: parsed?.name || null,
      inboxProviderType: parsed?.provider || null,
    });

    setFixResults(res.data);
    setFixing(false);
  }

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-amber-200 dark:border-amber-500/30 p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
            <MapPin className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Address Validation Failures</h3>
            <p className="text-xs text-gray-500">{addressFailures.length} order{addressFailures.length !== 1 ? "s" : ""} failed due to invalid city/state/zip</p>
          </div>
        </div>
        {!fixResults && (
          <button
            onClick={handleFixAndRetry}
            disabled={fixing}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white font-medium disabled:opacity-50"
          >
            {fixing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
            {fixing ? "Fixing & Retrying…" : "Fix Addresses & Retry"}
          </button>
        )}
      </div>

      {/* List of affected companies */}
      {!fixResults && !fixing && (
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {addressFailures.map((r, i) => (
            <div key={i} className="flex items-center justify-between text-xs py-1.5 px-2 rounded bg-red-50 dark:bg-red-500/10">
              <span className="text-gray-700 dark:text-gray-300">{r.companyName}</span>
              <span className="text-red-400 truncate max-w-xs ml-2" title={r.error}>Address invalid</span>
            </div>
          ))}
        </div>
      )}

      {/* Progress */}
      {fixing && (
        <div className="flex items-center gap-2 text-xs text-amber-500 py-2">
          <Loader2 className="w-3 h-3 animate-spin" />
          Looking up correct addresses via AI and patching companies… this may take a minute.
        </div>
      )}

      {/* Results */}
      {fixResults && (
        <div className="space-y-3">
          <div className="flex items-center gap-4 text-xs">
            <span className="text-green-500 font-medium">✅ Fixed & ordered: {fixResults.fixed}</span>
            <span className="text-red-500 font-medium">❌ Still failed: {fixResults.stillFailed}</span>
          </div>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {(fixResults.results || []).map((r, i) => (
              <div key={i} className="text-xs py-2 px-2 rounded bg-gray-50 dark:bg-gray-800 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700 dark:text-gray-300">{r.companyName}</span>
                  <span className={`flex items-center gap-1 ${r.status === "success" ? "text-green-500" : "text-red-500"}`}>
                    {r.status === "success" ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                    {r.status === "success" ? `Ordered (${r.domainUsed})` : `Failed at ${r.step}`}
                  </span>
                </div>
                {r.oldAddress && r.newAddress && (
                  <div className="text-gray-400 flex gap-3">
                    <span>
                      <span className="line-through">{r.oldAddress.city}, {r.oldAddress.state} {r.oldAddress.postalCode}</span>
                    </span>
                    <span>→</span>
                    <span className="text-green-400">{r.newAddress.city}, {r.newAddress.state} {r.newAddress.postalCode}</span>
                  </div>
                )}
                {r.newAddress?.explanation && (
                  <p className="text-gray-400 italic">{r.newAddress.explanation}</p>
                )}
                {r.status === "failed" && r.error && (
                  <p className="text-red-400">{r.error}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
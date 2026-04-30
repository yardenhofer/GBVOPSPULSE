import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ShieldAlert, Play, Zap, RefreshCw, Server, Upload, Shield } from "lucide-react";

import Pax8PasswordGate from "../components/pax8/Pax8PasswordGate.jsx";
import ProductVerification from "../components/pax8/ProductVerification.jsx";
import PreflightResults from "../components/pax8/PreflightResults.jsx";
import ClientGroupSelector from "../components/pax8/ClientGroupSelector.jsx";
import LiveConfirmationModal from "../components/pax8/LiveConfirmationModal.jsx";
import LiveRunProgress from "../components/pax8/LiveRunProgress.jsx";
import MockResultsSummary from "../components/pax8/MockResultsSummary.jsx";
import CsvCompanyImport from "../components/pax8/CsvCompanyImport.jsx";
import TenantListTab from "../components/pax8/TenantListTab.jsx";
import ScalesendsQueueTab from "../components/pax8/ScalesendsQueueTab.jsx";
import InboxProviderSelector from "../components/pax8/InboxProviderSelector.jsx";
import PorkbunCheckResults from "../components/pax8/PorkbunCheckResults.jsx";
import FailedOrdersFixer from "../components/pax8/FailedOrdersFixer.jsx";

const SPEND_CAP = 1000; // $1000/month spend cap per run
const ESTIMATED_MONTHLY_COST_PER_LICENSE = 4.2; // Exchange Online Plan 1 actual cost
const MAX_DOMAIN_RETRIES = 1; // No retries for test run (normally 5)
const MAX_BATCH_CLIENTS = 50; // Max clients per run

const TABS = [
  { id: "orders", label: "License Orders", icon: ShieldAlert },
  { id: "import", label: "Company Import", icon: Upload },
  { id: "tenants", label: "Provisioned Tenants", icon: Shield },
  { id: "scalesends", label: "Scalesends", icon: Server },
];

export default function Pax8Orders() {
  const [unlocked, setUnlocked] = useState(false);
  const [user, setUser] = useState(null);
  const [activeTab, setActiveTab] = useState("orders");

  // Product state
  const [product, setProduct] = useState(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState(null);

  // Preflight state
  const [preflightData, setPreflightData] = useState(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState(null);

  // Mock state
  const [mockResults, setMockResults] = useState(null);
  const [mockLoading, setMockLoading] = useState(false);
  const [mockProgress, setMockProgress] = useState(null);

  // Client selection
  const [selectedClientIds, setSelectedClientIds] = useState(new Set());

  // Live run state
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [liveResults, setLiveResults] = useState([]);
  const [liveRunning, setLiveRunning] = useState(false);
  const [currentClient, setCurrentClient] = useState(null);
  const [cumulativeCost, setCumulativeCost] = useState(0);
  const haltRef = useRef(false);
  const [halted, setHalted] = useState(false);

  // Inbox provider selection (from Scalesends API)
  const [selectedInboxProvider, setSelectedInboxProvider] = useState(null); // JSON string: {name, provider}

  // Porkbun check state
  const [porkbunCheckData, setPorkbunCheckData] = useState(null);
  const [porkbunCheckLoading, setPorkbunCheckLoading] = useState(false);


  useEffect(() => {
    base44.auth.me().then(u => setUser(u)).catch(() => {});
  }, []);

  // ── Step 1: Resolve Product ──
  async function resolveProduct() {
    setProductLoading(true);
    setProductError(null);
    const res = await base44.functions.invoke("pax8Auth", { action: "resolveProduct" });
    if (res.data.error) {
      setProductError(res.data.error);
    } else {
      setProduct(res.data);
    }
    setProductLoading(false);
  }

  // ── Step 2: Pre-flight ──
  async function runPreflight() {
    if (!product?.productId) return;
    setPreflightLoading(true);
    setPreflightError(null);
    setMockResults(null);
    const res = await base44.functions.invoke("pax8Auth", {
      action: "preflight",
      productId: product.productId,
    });
    if (res.data.error) {
      setPreflightError(res.data.error);
    } else {
      setPreflightData(res.data);
    }
    setPreflightLoading(false);
  }

  const cappedEligible = (preflightData?.eligible?.filter(c => selectedClientIds.has(c.companyId)) || []).slice(0, MAX_BATCH_CLIENTS);

  // ── Porkbun API access check ──
  async function runPorkbunCheck() {
    const eligible = preflightData?.eligible || [];
    if (eligible.length === 0) return;
    setPorkbunCheckLoading(true);
    setPorkbunCheckData(null);
    // Derive sending domains from company names (same logic as live orders)
    const domains = eligible.map(c => {
      if (c.domain && c.domain.includes(".")) return c.domain;
      return (c.companyName || "").toLowerCase().replace(/[^a-z0-9]/g, "") + ".info";
    });
    const res = await base44.functions.invoke("pax8Auth", { action: "checkPorkbunAccess", domains });
    setPorkbunCheckData(res.data);
    setPorkbunCheckLoading(false);
  }

  // ── Step 3: Mock Orders (batched from frontend to avoid timeout) ──
  async function runMockOrders() {
    if (!product?.productId || !cappedEligible.length) return;
    setMockLoading(true);
    setLiveResults([]);
    setHalted(false);
    setCumulativeCost(0);
    setMockResults(null);
    setMockProgress({ current: 0, total: cappedEligible.length });

    const BATCH_SIZE = 10;
    const allResults = [];

    for (let i = 0; i < cappedEligible.length; i += BATCH_SIZE) {
      const batch = cappedEligible.slice(i, i + BATCH_SIZE);
      const res = await base44.functions.invoke("pax8Auth", {
        action: "mockOrders",
        productId: product.productId,
        eligible: batch.map(c => ({ ...c, domain: c.domain || null })),
      });
      if (res.data.mockResults) {
        allResults.push(...res.data.mockResults);
      }
      setMockProgress({ current: Math.min(i + BATCH_SIZE, cappedEligible.length), total: cappedEligible.length });
    }

    setMockResults(allResults);
    setMockProgress(null);
    setMockLoading(false);
  }

  // ── Step 4+5: Live Orders (batched to avoid timeout) ──
  async function startLiveRun(amountTyped, confirmWord) {
    setShowConfirmModal(false);
    setLiveRunning(true);
    setLiveResults([]);
    setCumulativeCost(0);
    haltRef.current = false;
    setHalted(false);

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const eligible = cappedEligible;
    const inboxProvider = selectedInboxProvider ? JSON.parse(selectedInboxProvider) : null;

    // Create audit log entry
    await base44.entities.Pax8AuditLog.create({
      run_id: runId,
      triggered_by: user?.email || "unknown",
      mode: "live",
      status: "started",
      product_id: product.productId,
      product_name: product.name,
      product_sku: product.sku,
      eligible_count: eligible.length,
      skipped_count: preflightData.skipped.length,
      total_monthly_cost: eligible.length * ESTIMATED_MONTHLY_COST_PER_LICENSE,
      confirmation_amount_typed: amountTyped,
      confirmation_word_typed: confirmWord,
      eligible_clients: JSON.stringify(eligible.map(c => c.companyName)).substring(0, 5000),
      skipped_clients: JSON.stringify(preflightData.skipped.map(c => ({ name: c.companyName, reason: c.reason }))).substring(0, 5000),
    });

    const allResults = [];
    let totalSpend = 0;
    const BATCH_SIZE = 10;

    for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
      if (haltRef.current) break;

      // Spend guard
      if (totalSpend >= SPEND_CAP) {
        setHalted(true);
        break;
      }

      const batch = eligible.slice(i, i + BATCH_SIZE);
      setCurrentClient(`Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch[0].companyName}…`);

      const res = await base44.functions.invoke("pax8Auth", {
        action: "placeOrders",
        clients: batch.map(c => ({ companyId: c.companyId, companyName: c.companyName, domain: c.domain || null })),
        runId,
        maxDomainRetries: MAX_DOMAIN_RETRIES,
        inboxProviderName: inboxProvider?.name || null,
        inboxProviderType: inboxProvider?.provider || null,
      });

      const batchResults = res.data.results || [];
      allResults.push(...batchResults);
      setLiveResults([...allResults]);

      const batchSuccess = batchResults.filter(r => r.status === "success").length;
      totalSpend += batchSuccess * ESTIMATED_MONTHLY_COST_PER_LICENSE;
      setCumulativeCost(totalSpend);
    }

    setCurrentClient(null);
    setLiveRunning(false);

    const finalStatus = haltRef.current ? "halted" : "completed";

    // Update audit log
    const logs = await base44.entities.Pax8AuditLog.filter({ run_id: runId });
    if (logs[0]) {
      await base44.entities.Pax8AuditLog.update(logs[0].id, {
        status: finalStatus,
        success_count: allResults.filter(r => r.status === "success").length,
        failed_count: allResults.filter(r => r.status === "failed").length,
        results: JSON.stringify(allResults),
      });
    }

    const successCount = allResults.filter(r => r.status === "success").length;
    const failCount = allResults.filter(r => r.status === "failed").length;

    base44.integrations.Core.SendEmail({
      to: user?.email,
      subject: `Pax8 Live Run ${finalStatus.toUpperCase()} — ${successCount} orders placed`,
      body: `
        <h2>Pax8 License Order Run — ${finalStatus.toUpperCase()}</h2>
        <p><strong>Triggered by:</strong> ${user?.full_name || user?.email}</p>
        <p><strong>Product:</strong> ${product.name} (${product.sku})</p>
        <p><strong>Results:</strong></p>
        <ul>
          <li>✅ Successful: ${successCount}</li>
          <li>❌ Failed: ${failCount}</li>
        </ul>
        <p><strong>Total monthly spend:</strong> $${totalSpend.toFixed(2)}</p>
        ${failCount > 0 ? `<h3>Failed Orders:</h3><ul>${allResults.filter(r => r.status === "failed").map(r => `<li>${r.companyName}: ${r.error}</li>`).join("")}</ul>` : ""}
      `,
    }).catch(() => {});
  }

  function handleHalt() {
    haltRef.current = true;
    setHalted(true);
  }

  if (!unlocked) {
    return <Pax8PasswordGate onUnlock={() => setUnlocked(true)} />;
  }

  const totalEstimatedCost = cappedEligible.length * ESTIMATED_MONTHLY_COST_PER_LICENSE;
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pax8 Operations</h1>
            <p className="text-sm text-gray-500">License orders, company import, and tenant provisioning</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800/50 rounded-lg p-1">
        {TABS.map(tab => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors flex-1 justify-center ${
                activeTab === tab.id
                  ? "bg-white dark:bg-gray-900 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              }`}
            >
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {activeTab === "orders" && (
        <div className="space-y-5">
          {/* Warning banner */}
          <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-500">Financial safeguard module</p>
              <p className="text-xs text-red-400 mt-1">
                This module places real Microsoft NCE license commitments. Every run starts in mock mode.
                Live orders require admin role, dual confirmation, and cannot be undone.
                Spend cap: ${SPEND_CAP.toLocaleString()}/month per run. Batch cap: {MAX_BATCH_CLIENTS} clients.
              </p>
            </div>
          </div>

          <ProductVerification product={product} loading={productLoading} error={productError} onResolve={resolveProduct} />

          {product && (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Pre-Flight Check</h3>
                <button onClick={runPreflight} disabled={preflightLoading} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50">
                  <RefreshCw className={`w-3 h-3 ${preflightLoading ? "animate-spin" : ""}`} />
                  {preflightLoading ? "Scanning…" : "Run Pre-Flight"}
                </button>
              </div>
              {preflightError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400">{preflightError}</div>
              )}
            </div>
          )}

          {preflightData && <PreflightResults data={preflightData} mockResults={mockResults} />}

          {preflightData && preflightData.eligible?.length > 0 && (
            <PorkbunCheckResults data={porkbunCheckData} loading={porkbunCheckLoading} onRun={runPorkbunCheck} />
          )}

          {preflightData && preflightData.eligible.length > 0 && (
            <ClientGroupSelector eligible={preflightData.eligible} selectedIds={selectedClientIds} onSelectionChange={(ids) => { setSelectedClientIds(ids); setMockResults(null); }} />
          )}

          {preflightData && cappedEligible.length > 0 && (
            <div className="bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/20 rounded-xl p-4 space-y-3">
              <p className="text-sm font-medium text-blue-700 dark:text-blue-300 text-center">
                {cappedEligible.length} tenant{cappedEligible.length !== 1 ? "s" : ""} selected · Est. cost: ${(cappedEligible.length * ESTIMATED_MONTHLY_COST_PER_LICENSE).toFixed(2)}/mo
              </p>
              {selectedClientIds.size > MAX_BATCH_CLIENTS && (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center font-medium">
                  ⚠ {selectedClientIds.size} selected but capped to {MAX_BATCH_CLIENTS} per run. Run again for the rest.
                </p>
              )}
              <div className="max-w-xs mx-auto">
                <InboxProviderSelector value={selectedInboxProvider} onChange={setSelectedInboxProvider} />
              </div>
            </div>
          )}

          {preflightData && cappedEligible.length > 0 && !mockResults && (
            <div className="flex justify-center">
              <div className="flex flex-col items-center gap-2">
                {!selectedInboxProvider && (
                  <p className="text-xs text-amber-500 font-medium">Select an inbox provider above before proceeding.</p>
                )}
                <button onClick={runMockOrders} disabled={mockLoading || !selectedInboxProvider} className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50">
                  <Play className="w-4 h-4" />
                  {mockLoading ? "Running Mock Orders…" : "Run Mock Orders (Dry Run)"}
                </button>
                {mockLoading && mockProgress && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <div className="w-32 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                      <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${Math.round((mockProgress.current / mockProgress.total) * 100)}%` }} />
                    </div>
                    {mockProgress.current}/{mockProgress.total} processed
                  </div>
                )}
              </div>
            </div>
          )}

          {mockResults && !liveRunning && liveResults.length === 0 && (
            <>
              <MockResultsSummary mockResults={mockResults} onRerunMock={() => { setMockResults(null); }} />

              {isAdmin && (
                <div className="flex flex-col items-center gap-3">
                  <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
                    <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
                      Estimated total monthly cost: ${totalEstimatedCost.toLocaleString()} · Annual liability: ${(totalEstimatedCost * 12).toLocaleString()}
                    </p>
                  </div>
                  <button onClick={() => setShowConfirmModal(true)} className="flex items-center gap-2 px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors">
                    <Zap className="w-4 h-4" />
                    Place Live Orders ({cappedEligible.length} tenants)
                  </button>
                </div>
              )}
            </>
          )}



          {(liveRunning || liveResults.length > 0) && (
            <LiveRunProgress results={liveResults} currentClient={currentClient} totalClients={cappedEligible.length} halted={halted} cumulativeCost={cumulativeCost} spendCap={SPEND_CAP} onHalt={handleHalt} />
          )}

          {!liveRunning && liveResults.length > 0 && (
            <FailedOrdersFixer liveResults={liveResults} inboxProvider={selectedInboxProvider} maxDomainRetries={MAX_DOMAIN_RETRIES} />
          )}
        </div>
      )}

      {activeTab === "import" && <CsvCompanyImport />}

      {activeTab === "tenants" && <TenantListTab />}

      {activeTab === "scalesends" && <ScalesendsQueueTab />}

      {showConfirmModal && (
        <LiveConfirmationModal
          eligibleCount={cappedEligible.length}
          totalMonthlyCost={totalEstimatedCost}
          onConfirm={startLiveRun}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}
    </div>
  );
}
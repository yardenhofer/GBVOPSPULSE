import { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { ShieldAlert, Play, Zap, RefreshCw } from "lucide-react";

import Pax8PasswordGate from "../components/pax8/Pax8PasswordGate";
import ProductVerification from "../components/pax8/ProductVerification";
import PreflightResults from "../components/pax8/PreflightResults";
import LiveConfirmationModal from "../components/pax8/LiveConfirmationModal";
import LiveRunProgress from "../components/pax8/LiveRunProgress";

const SPEND_CAP = 10000;
const ESTIMATED_MONTHLY_COST_PER_LICENSE = 23;

export default function Pax8Orders() {
  const [unlocked, setUnlocked] = useState(false);
  const [user, setUser] = useState(null);

  const [product, setProduct] = useState(null);
  const [productLoading, setProductLoading] = useState(false);
  const [productError, setProductError] = useState(null);

  const [preflightData, setPreflightData] = useState(null);
  const [preflightLoading, setPreflightLoading] = useState(false);
  const [preflightError, setPreflightError] = useState(null);

  const [mockResults, setMockResults] = useState(null);
  const [mockLoading, setMockLoading] = useState(false);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [liveResults, setLiveResults] = useState([]);
  const [liveRunning, setLiveRunning] = useState(false);
  const [currentClient, setCurrentClient] = useState(null);
  const [cumulativeCost, setCumulativeCost] = useState(0);
  const haltRef = useRef(false);
  const [halted, setHalted] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => setUser(u)).catch(() => {});
  }, []);

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

  async function runMockOrders() {
    if (!product?.productId || !preflightData?.eligible) return;
    setMockLoading(true);
    const res = await base44.functions.invoke("pax8Auth", {
      action: "mockOrders",
      productId: product.productId,
      eligible: preflightData.eligible,
    });
    if (res.data.mockResults) {
      setMockResults(res.data.mockResults);
    }
    setMockLoading(false);
  }

  async function startLiveRun(amountTyped, confirmWord) {
    setShowConfirmModal(false);
    setLiveRunning(true);
    setLiveResults([]);
    setCumulativeCost(0);
    haltRef.current = false;
    setHalted(false);

    const runId = `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const eligible = preflightData.eligible;

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
      eligible_clients: JSON.stringify(eligible),
      skipped_clients: JSON.stringify(preflightData.skipped),
    });

    const results = [];
    let totalSpend = 0;

    for (let i = 0; i < eligible.length; i++) {
      if (haltRef.current) break;

      const client = eligible[i];
      setCurrentClient(client.companyName);

      if (totalSpend >= SPEND_CAP) {
        setHalted(true);
        break;
      }

      const res = await base44.functions.invoke("pax8Auth", {
        action: "placeOrder",
        productId: product.productId,
        companyId: client.companyId,
        companyName: client.companyName,
        runId,
      });

      const result = {
        companyId: client.companyId,
        companyName: client.companyName,
        status: res.data.status || "failed",
        error: res.data.error || res.data.reason || null,
        response: res.data.response,
      };
      results.push(result);
      setLiveResults([...results]);

      if (result.status === "success") {
        totalSpend += ESTIMATED_MONTHLY_COST_PER_LICENSE;
        setCumulativeCost(totalSpend);
      }

      if (i < eligible.length - 1 && !haltRef.current) {
        await new Promise(r => setTimeout(r, 2000));
      }
    }

    setCurrentClient(null);
    setLiveRunning(false);

    const finalStatus = haltRef.current ? "halted" : "completed";

    const logs = await base44.entities.Pax8AuditLog.filter({ run_id: runId });
    if (logs[0]) {
      await base44.entities.Pax8AuditLog.update(logs[0].id, {
        status: finalStatus,
        success_count: results.filter(r => r.status === "success").length,
        failed_count: results.filter(r => r.status === "failed").length,
        results: JSON.stringify(results),
      });
    }

    const successCount = results.filter(r => r.status === "success").length;
    const failCount = results.filter(r => r.status === "failed").length;
    const skipCount = results.filter(r => r.status === "skipped").length;

    base44.integrations.Core.SendEmail({
      to: user?.email,
      subject: `Pax8 Live Run ${finalStatus.toUpperCase()} — ${successCount} orders placed`,
      body: `
        <h2>Pax8 License Order Run — ${finalStatus.toUpperCase()}</h2>
        <p><strong>Triggered by:</strong> ${user?.full_name || user?.email}</p>
        <p><strong>Product:</strong> ${product.name} (${product.sku})</p>
        <ul>
          <li>✅ Successful: ${successCount}</li>
          <li>❌ Failed: ${failCount}</li>
          <li>⏭ Skipped: ${skipCount}</li>
        </ul>
        <p><strong>Total monthly spend:</strong> $${totalSpend}</p>
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

  const totalEstimatedCost = (preflightData?.eligible?.length || 0) * ESTIMATED_MONTHLY_COST_PER_LICENSE;
  const isAdmin = user?.role === "admin";

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Pax8 License Auto-Order</h1>
            <p className="text-sm text-gray-500">SKU: MST-NCE-179-C100 · Quantity: 1 (fixed) · Mode: Mock by default</p>
          </div>
        </div>
      </div>

      <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-start gap-3">
        <ShieldAlert className="w-5 h-5 text-red-500 mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-semibold text-red-500">Financial safeguard module</p>
          <p className="text-xs text-red-400 mt-1">
            This module places real Microsoft NCE license commitments. Every run starts in mock mode.
            Live orders require admin role, dual confirmation, and cannot be undone.
            Spend cap: ${SPEND_CAP.toLocaleString()}/month per run. Batch cap: 100 clients.
          </p>
        </div>
      </div>

      <ProductVerification
        product={product}
        loading={productLoading}
        error={productError}
        onResolve={resolveProduct}
      />

      {product && (
        <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Pre-Flight Check</h3>
            <button
              onClick={runPreflight}
              disabled={preflightLoading}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
            >
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

      {preflightData && preflightData.eligible.length > 0 && !mockResults && (
        <div className="flex justify-center">
          <button
            onClick={runMockOrders}
            disabled={mockLoading}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium disabled:opacity-50"
          >
            <Play className="w-4 h-4" />
            {mockLoading ? "Running Mock Orders…" : "Run Mock Orders (Dry Run)"}
          </button>
        </div>
      )}

      {mockResults && !liveRunning && liveResults.length === 0 && isAdmin && (
        <div className="flex flex-col items-center gap-3">
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 text-center">
            <p className="text-sm font-semibold text-yellow-600 dark:text-yellow-400">
              Estimated total monthly cost: ${totalEstimatedCost.toLocaleString()} · Annual liability: ${(totalEstimatedCost * 12).toLocaleString()}
            </p>
          </div>
          <button
            onClick={() => setShowConfirmModal(true)}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors"
          >
            <Zap className="w-4 h-4" />
            Place Live Orders ({preflightData.eligible.length} clients)
          </button>
        </div>
      )}

      {!isAdmin && mockResults && liveResults.length === 0 && (
        <div className="bg-gray-100 dark:bg-gray-800 rounded-xl p-4 text-center">
          <p className="text-sm text-gray-500">Live order placement requires admin role.</p>
        </div>
      )}

      {(liveRunning || liveResults.length > 0) && (
        <LiveRunProgress
          results={liveResults}
          currentClient={currentClient}
          totalClients={preflightData?.eligible?.length || 0}
          halted={halted}
          cumulativeCost={cumulativeCost}
          spendCap={SPEND_CAP}
          onHalt={handleHalt}
        />
      )}

      {showConfirmModal && (
        <LiveConfirmationModal
          eligibleCount={preflightData.eligible.length}
          totalMonthlyCost={totalEstimatedCost}
          onConfirm={startLiveRun}
          onCancel={() => setShowConfirmModal(false)}
        />
      )}
    </div>
  );
}
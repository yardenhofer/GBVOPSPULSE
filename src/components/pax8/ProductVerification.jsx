import { CheckCircle, AlertCircle, RefreshCw } from "lucide-react";

export default function ProductVerification({ product, loading, error, onResolve }) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-gray-900 dark:text-white text-sm">Step 1: Product Verification</h3>
        <button
          onClick={onResolve}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-medium disabled:opacity-50"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
          {loading ? "Resolving…" : product ? "Re-verify" : "Resolve Product"}
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-400">{error}</p>
        </div>
      )}

      {product && (
        <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/20 rounded-lg p-3">
          <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
          <div className="text-xs text-green-400 space-y-0.5">
            <p><strong>Product:</strong> {product.name}</p>
            <p><strong>SKU:</strong> {product.sku}</p>
            <p><strong>Product ID:</strong> {product.productId}</p>
            {product.unitPrice && <p><strong>Unit Price:</strong> ${product.unitPrice}/mo</p>}
          </div>
        </div>
      )}

      {!product && !error && !loading && (
        <p className="text-xs text-gray-500">Click "Resolve Product" to look up the SKU in Pax8.</p>
      )}
    </div>
  );
}
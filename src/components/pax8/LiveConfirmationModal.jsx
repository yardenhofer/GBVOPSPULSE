import { useState } from "react";
import { ShieldAlert } from "lucide-react";

export default function LiveConfirmationModal({ eligibleCount, totalMonthlyCost, onConfirm, onCancel }) {
  const [amountInput, setAmountInput] = useState("");
  const [wordInput, setWordInput] = useState("");

  const expectedAmount = totalMonthlyCost.toFixed(2);
  const amountMatch = amountInput.trim() === expectedAmount;
  const wordMatch = wordInput.trim().toUpperCase() === "CONFIRM";
  const canConfirm = amountMatch && wordMatch;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-red-500/30 p-6 max-w-md w-full mx-4 space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
            <ShieldAlert className="w-5 h-5 text-red-500" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900 dark:text-white">Confirm Live Orders</h3>
            <p className="text-xs text-red-400">This action cannot be undone.</p>
          </div>
        </div>

        <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-xs text-red-400 space-y-1">
          <p>You are about to place <strong>{eligibleCount}</strong> real license orders.</p>
          <p>Estimated monthly cost: <strong>${totalMonthlyCost.toLocaleString()}</strong></p>
          <p>Estimated annual liability: <strong>${(totalMonthlyCost * 12).toLocaleString()}</strong></p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Type the exact dollar amount: <strong>${expectedAmount}</strong>
            </label>
            <input
              type="text"
              value={amountInput}
              onChange={e => setAmountInput(e.target.value)}
              placeholder={`$${expectedAmount}`}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-red-500"
            />
            {amountInput && !amountMatch && (
              <p className="text-xs text-red-500 mt-1">Amount doesn't match.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Type <strong>CONFIRM</strong> to proceed
            </label>
            <input
              type="text"
              value={wordInput}
              onChange={e => setWordInput(e.target.value)}
              placeholder="CONFIRM"
              className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm outline-none focus:ring-2 focus:ring-red-500"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onConfirm(amountInput, wordInput)}
            disabled={!canConfirm}
            className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-bold transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Place {eligibleCount} Live Orders
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-sm font-medium hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
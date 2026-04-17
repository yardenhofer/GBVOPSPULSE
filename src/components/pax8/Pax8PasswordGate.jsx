import { useState } from "react";
import { ShieldAlert, Lock } from "lucide-react";

const GATE_PASSWORD = "pax8admin";

export default function Pax8PasswordGate({ onUnlock }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);

  function handleSubmit(e) {
    e.preventDefault();
    if (password === GATE_PASSWORD) {
      onUnlock();
    } else {
      setError(true);
      setPassword("");
    }
  }

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-8 max-w-sm w-full text-center space-y-5">
        <div className="w-14 h-14 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto">
          <ShieldAlert className="w-7 h-7 text-red-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">Pax8 License Orders</h2>
          <p className="text-sm text-gray-500 mt-1">Enter the module password to continue.</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="password"
              value={password}
              onChange={e => { setPassword(e.target.value); setError(false); }}
              placeholder="Module password"
              className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
              autoFocus
            />
          </div>
          {error && <p className="text-xs text-red-500">Incorrect password. Try again.</p>}
          <button
            type="submit"
            className="w-full py-2.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-medium transition-colors"
          >
            Unlock Module
          </button>
        </form>
      </div>
    </div>
  );
}
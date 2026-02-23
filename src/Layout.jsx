import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { LayoutDashboard, ClipboardCheck, TrendingUp, Bell, Sun, Moon, Menu, Zap } from "lucide-react";
import { base44 } from "@/api/base44Client";

const NAV = [
  { label: "Dashboard",      page: "Dashboard",     icon: LayoutDashboard },
  { label: "Daily Check-In", page: "DailyCheckIn",  icon: ClipboardCheck },
  { label: "Alerts",         page: "Alerts",         icon: Bell },
  { label: "Executive View", page: "ExecutiveView",  icon: TrendingUp },
];

export default function Layout({ children, currentPageName }) {
  const [dark, setDark] = useState(() => localStorage.getItem("opsTheme") !== "light");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);

  useEffect(() => {
    localStorage.setItem("opsTheme", dark ? "dark" : "light");
    if (dark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [dark]);

  useEffect(() => {
    base44.auth.me().then(setUser).catch(() => {});
  }, []);

  return (
    <>
      <style>{`
        .status-glow-healthy { box-shadow: 0 0 8px rgba(34,197,94,0.35); }
        .status-glow-monitor { box-shadow: 0 0 8px rgba(234,179,8,0.35); }
        .status-glow-at-risk { box-shadow: 0 0 8px rgba(249,115,22,0.35); }
        .status-glow-critical { box-shadow: 0 0 8px rgba(239,68,68,0.35); }
        .flag-chip { position: relative; cursor: default; }
        .flag-chip:hover::after {
          content: attr(data-tip);
          position: absolute;
          bottom: calc(100% + 6px);
          left: 50%;
          transform: translateX(-50%);
          white-space: nowrap;
          background: #1e293b;
          color: #f1f5f9;
          font-size: 11px;
          padding: 4px 8px;
          border-radius: 6px;
          pointer-events: none;
          z-index: 100;
          border: 1px solid #334155;
        }
      `}</style>

      <div className="flex h-screen bg-gray-50 dark:bg-gray-950 overflow-hidden">

        {/* ── Sidebar ── */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 z-50 w-56 flex flex-col shrink-0
          bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800
          transition-transform duration-200
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
        `}>
          {/* Logo */}
          <div className="flex items-center gap-2.5 px-5 h-14 border-b border-gray-200 dark:border-gray-800 shrink-0">
            <div className="w-7 h-7 rounded-md bg-blue-600 flex items-center justify-center shrink-0">
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-gray-900 dark:text-white tracking-tight">OpsControl</span>
          </div>

          {/* Nav */}
          <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
            {NAV.map(({ label, page, icon: Icon }) => (
              <Link
                key={page}
                to={createPageUrl(page)}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${currentPageName === page
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-white"
                  }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            ))}
          </nav>

          {/* Bottom */}
          <div className="p-3 border-t border-gray-200 dark:border-gray-800 space-y-1 shrink-0">
            <button
              onClick={() => setDark(!dark)}
              className="flex items-center gap-3 px-3 py-2 w-full rounded-lg text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              {dark ? "Light Mode" : "Dark Mode"}
            </button>
            {user && (
              <div className="px-3 py-2 rounded-lg bg-gray-100 dark:bg-gray-800/60">
                <p className="text-xs font-semibold text-gray-800 dark:text-gray-200 truncate">{user.full_name}</p>
                <p className="text-xs text-gray-500 truncate">{user.email}</p>
              </div>
            )}
          </div>
        </aside>

        {/* Overlay */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setSidebarOpen(false)} />
        )}

        {/* ── Main ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Mobile header */}
          <header className="lg:hidden flex items-center gap-3 h-14 px-4 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shrink-0">
            <button onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            </button>
            <span className="font-bold text-gray-900 dark:text-white">OpsControl</span>
          </header>

          <main className="flex-1 overflow-y-auto">
            <div className="max-w-screen-2xl mx-auto p-4 lg:p-6">
              {children}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
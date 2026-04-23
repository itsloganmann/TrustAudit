import { useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import {
  Shield,
  LayoutDashboard,
  AlertTriangle,
  BarChart3,
  Settings,
  LogOut,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import SidebarNav from "./SidebarNav.jsx";
import { useAuth } from "../../hooks/useAuth.js";
import LiveInvoiceStream from "../LiveInvoiceStream.jsx";
import { VendorLiveStatusContext } from "./vendorLiveStatus.js";

/**
 * Authenticated shell for `/vendor/*` routes.
 *
 * Top bar with brand + portfolio metric pills, sidebar with primary nav,
 * user menu in the right corner, and an `<Outlet/>` for nested routes.
 */
export default function VendorShell() {
  const { user, signout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [liveStatus, setLiveStatus] = useState("idle");

  const navItems = [
    { to: "/vendor", end: true, label: "Dashboard", icon: <LayoutDashboard size={14} /> },
    { to: "/vendor/disputes", label: "Disputes", icon: <AlertTriangle size={14} /> },
    { to: "/vendor/analytics", label: "Analytics", icon: <BarChart3 size={14} /> },
    { to: "/vendor/settings", label: "Settings", icon: <Settings size={14} /> },
  ];

  const handleSignout = async () => {
    await signout();
    navigate("/auth/vendor/signin");
  };

  return (
    <VendorLiveStatusContext.Provider value={liveStatus}>
      <LiveInvoiceStream onStatus={setLiveStatus} />
    <div className="min-h-screen bg-white text-zinc-700 font-sans antialiased">
      {/* Top bar */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden p-1.5 rounded-lg border border-zinc-200 bg-white text-zinc-900"
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
            <Link to="/vendor" className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center">
                <Shield size={13} className="text-white" strokeWidth={2.5} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-zinc-900 font-semibold text-[14px] tracking-tight">
                  TrustAudit
                </span>
                <span className="text-[10px] text-zinc-600 font-semibold px-1.5 py-0.5 rounded-md bg-zinc-50 border border-zinc-200">
                  AP decisions
                </span>
              </div>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-2 text-[11px] text-zinc-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            {liveStatus === "open"
              ? "Live · decisions stream"
              : liveStatus === "polling"
                ? "Live · polling 2s"
                : "Live · auto-refresh 2s"}
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2.5 h-9 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 transition-all"
            >
              <div className="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[10px] font-bold text-emerald-700">
                {(user?.full_name || "?").slice(0, 1).toUpperCase()}
              </div>
              <span className="text-[12px] text-zinc-900 font-medium hidden sm:inline">
                {user?.full_name || "Signed in"}
              </span>
              <ChevronDown size={12} className="text-zinc-500" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden z-50">
                <div className="px-3 py-2.5 border-b border-zinc-200">
                  <p className="text-[12px] text-zinc-900 font-semibold truncate">
                    {user?.full_name}
                  </p>
                  <p className="text-[10px] text-zinc-500 truncate">
                    {user?.role === "vendor" ? "AP lead" : user?.role}
                  </p>
                </div>
                <Link
                  to="/vendor/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-[12px] text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
                >
                  <Settings size={13} />
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={handleSignout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-zinc-700 hover:bg-zinc-50 hover:text-zinc-900 transition-colors"
                >
                  <LogOut size={13} />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="max-w-[1600px] mx-auto flex">
        {/* Sidebar */}
        <aside
          className={`${
            mobileOpen ? "block" : "hidden"
          } lg:block w-56 shrink-0 px-3 py-5 border-r border-zinc-200 sticky top-14 self-start min-h-[calc(100vh-3.5rem)] bg-white`}
        >
          <SidebarNav items={navItems} />
          <div className="mt-6 pt-4 border-t border-zinc-200">
            <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold px-3">
              Team
            </p>
            <Link
              to="/about"
              className="mt-1 flex items-center gap-2 px-3 h-9 rounded-lg text-[12px] text-zinc-600 hover:text-zinc-900 hover:bg-zinc-50 transition-all"
            >
              About the founders
            </Link>
          </div>
        </aside>

        {/* Content slot */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-5">
          <Outlet />
        </main>
      </div>
    </div>
    </VendorLiveStatusContext.Provider>
  );
}

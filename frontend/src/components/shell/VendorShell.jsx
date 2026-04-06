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
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-400 font-sans antialiased">
      {/* Top bar */}
      <header className="border-b border-white/[0.06] bg-slate-950/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              className="lg:hidden p-1.5 rounded-lg glass text-white"
              aria-label="Toggle navigation"
            >
              {mobileOpen ? <X size={16} /> : <Menu size={16} />}
            </button>
            <Link to="/vendor" className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
                <Shield size={13} className="text-slate-950" strokeWidth={2.5} />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white font-semibold text-[14px] tracking-tight">
                  TrustAudit
                </span>
                <span className="text-[10px] text-slate-500 font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08]">
                  43B(h)
                </span>
              </div>
            </Link>
          </div>

          <div className="hidden md:flex items-center gap-2 text-[11px] text-slate-500">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            Live · auto-refresh 2s
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2.5 h-9 rounded-lg glass glass-hover transition-all"
            >
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-emerald-500/30 to-blue-500/20 border border-white/[0.08] flex items-center justify-center text-[10px] font-bold text-white">
                {(user?.full_name || "?").slice(0, 1).toUpperCase()}
              </div>
              <span className="text-[12px] text-white font-medium hidden sm:inline">
                {user?.full_name || "Signed in"}
              </span>
              <ChevronDown size={12} className="text-slate-500" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 glass rounded-xl border border-white/[0.08] shadow-2xl shadow-slate-950/60 overflow-hidden z-50">
                <div className="px-3 py-2.5 border-b border-white/[0.06]">
                  <p className="text-[12px] text-white font-semibold truncate">
                    {user?.full_name}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">
                    {user?.role === "vendor" ? "Vendor account" : user?.role}
                  </p>
                </div>
                <Link
                  to="/vendor/settings"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-[12px] text-slate-300 hover:bg-white/[0.04] hover:text-white transition-colors"
                >
                  <Settings size={13} />
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={handleSignout}
                  className="w-full flex items-center gap-2 px-3 py-2 text-[12px] text-slate-300 hover:bg-white/[0.04] hover:text-white transition-colors"
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
          } lg:block w-56 shrink-0 px-3 py-5 border-r border-white/[0.04] sticky top-14 self-start min-h-[calc(100vh-3.5rem)]`}
        >
          <SidebarNav items={navItems} />
          <div className="mt-6 pt-4 border-t border-white/[0.06]">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold px-3">
              Get help
            </p>
            <Link
              to="/help/demo"
              className="mt-1 flex items-center gap-2 px-3 h-9 rounded-lg text-[12px] text-slate-500 hover:text-slate-200 hover:bg-white/[0.03] transition-all"
            >
              How to demo
            </Link>
          </div>
        </aside>

        {/* Content slot */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-5">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

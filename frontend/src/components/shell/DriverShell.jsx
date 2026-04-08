import { useState } from "react";
import { Outlet, Link, useNavigate } from "react-router-dom";
import { Shield, MessageCircle, LogOut, ChevronDown } from "lucide-react";
import { useAuth } from "../../hooks/useAuth.js";
import { WA_LINK, WHATSAPP_NUMBER_DISPLAY } from "../../config/whatsapp.js";

/**
 * Mobile-first authenticated shell for `/driver/*` routes.
 *
 * Compact top bar, prominent "Send a new challan via WhatsApp" CTA pinned
 * just below the header, and an `<Outlet/>` for nested driver routes.
 */
export default function DriverShell() {
  const { user, signout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleSignout = async () => {
    await signout();
    navigate("/auth/driver/signin");
  };

  const openWhatsApp = () => {
    if (typeof window !== "undefined") {
      window.open(WA_LINK, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-400 font-sans antialiased">
      <header className="border-b border-white/[0.06] bg-slate-950/70 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/driver" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
              <Shield size={13} className="text-slate-950" strokeWidth={2.5} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold text-[14px] tracking-tight">
                TrustAudit
              </span>
              <span className="text-[10px] text-amber-300 font-semibold px-1.5 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20">
                Driver
              </span>
            </div>
          </Link>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2.5 h-9 rounded-lg glass glass-hover transition-all"
            >
              <div className="w-6 h-6 rounded-md bg-gradient-to-br from-amber-500/30 to-rose-500/20 border border-white/[0.08] flex items-center justify-center text-[10px] font-bold text-white">
                {(user?.full_name || "?").slice(0, 1).toUpperCase()}
              </div>
              <span className="text-[12px] text-white font-medium hidden sm:inline max-w-[120px] truncate">
                {user?.full_name || "Driver"}
              </span>
              <ChevronDown size={12} className="text-slate-500" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 glass rounded-xl border border-white/[0.08] shadow-2xl shadow-slate-950/60 overflow-hidden z-50">
                <div className="px-3 py-2.5 border-b border-white/[0.06]">
                  <p className="text-[12px] text-white font-semibold truncate">
                    {user?.full_name}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate">
                    Supplier driver
                  </p>
                </div>
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

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        {/* Big WhatsApp CTA */}
        <button
          type="button"
          onClick={openWhatsApp}
          className="group w-full glass rounded-2xl p-5 border border-emerald-500/15 bg-gradient-to-br from-emerald-500/[0.06] to-emerald-500/[0.02] hover:border-emerald-500/30 transition-all text-left"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-500 text-slate-950 flex items-center justify-center shrink-0 shadow-[0_8px_32px_-12px_rgba(16,185,129,0.7)] group-hover:scale-105 transition-transform">
              <MessageCircle size={22} strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] text-white font-bold tracking-tight">
                Send a bill photo on WhatsApp
              </p>
              <p className="text-[12px] text-slate-400 mt-0.5">
                Tap to open WhatsApp · {WHATSAPP_NUMBER_DISPLAY}
              </p>
            </div>
            <div className="text-[11px] text-emerald-300 font-semibold uppercase tracking-widest hidden sm:inline">
              Open →
            </div>
          </div>
        </button>

        <Outlet />
      </main>
    </div>
  );
}

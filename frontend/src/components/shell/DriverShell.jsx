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
    <div className="min-h-screen bg-white text-zinc-700 font-sans antialiased">
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-40">
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link to="/driver" className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center">
              <Shield size={13} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-zinc-900 font-semibold text-[14px] tracking-tight">
                TrustAudit
              </span>
              <span className="text-[10px] text-emerald-700 font-semibold px-1.5 py-0.5 rounded-md bg-emerald-50 border border-emerald-200">
                Supplier driver
              </span>
            </div>
          </Link>

          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              className="flex items-center gap-2 px-2.5 h-9 rounded-lg bg-white border border-zinc-200 hover:bg-zinc-50 hover:border-zinc-300 transition-all"
            >
              <div className="w-6 h-6 rounded-md bg-emerald-50 border border-emerald-200 flex items-center justify-center text-[10px] font-bold text-emerald-700">
                {(user?.full_name || "?").slice(0, 1).toUpperCase()}
              </div>
              <span className="text-[12px] text-zinc-900 font-medium hidden sm:inline max-w-[120px] truncate">
                {user?.full_name || "Driver"}
              </span>
              <ChevronDown size={12} className="text-zinc-500" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-52 bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden z-50">
                <div className="px-3 py-2.5 border-b border-zinc-200">
                  <p className="text-[12px] text-zinc-900 font-semibold truncate">
                    {user?.full_name}
                  </p>
                  <p className="text-[10px] text-zinc-500 truncate">
                    Supplier driver
                  </p>
                </div>
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

      <main className="max-w-3xl mx-auto px-4 py-5 space-y-5">
        {/* Big WhatsApp CTA */}
        <button
          type="button"
          onClick={openWhatsApp}
          className="group w-full rounded-2xl p-5 border border-emerald-200 bg-emerald-50 hover:border-emerald-300 hover:bg-emerald-100 transition-all text-left"
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <MessageCircle size={22} strokeWidth={2.5} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[15px] text-zinc-900 font-bold tracking-tight">
                Send acceptance proof on WhatsApp
              </p>
              <p className="text-[12px] text-zinc-600 mt-0.5">
                Tap to open WhatsApp · {WHATSAPP_NUMBER_DISPLAY}
              </p>
            </div>
            <div className="text-[11px] text-emerald-700 font-semibold uppercase tracking-widest hidden sm:inline">
              Open →
            </div>
          </div>
        </button>

        <Outlet />
      </main>
    </div>
  );
}

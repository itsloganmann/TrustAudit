import { useMemo } from "react";
import { Toaster } from "sonner";
import { motion } from "framer-motion";
import { MessageSquare, Truck, ChevronRight } from "lucide-react";
import DocumentStatePill from "../components/invoices/DocumentStatePill.jsx";
import ConfidenceBar from "../components/invoices/ConfidenceBar.jsx";
import { useInvoices } from "../hooks/useInvoices.js";

const WHATSAPP_DEEPLINK =
  "https://wa.me/911234567890?text=" +
  encodeURIComponent("New challan upload");

function formatRelative(iso) {
  if (!iso) return "—";
  try {
    const then = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - then) / 1000;
    if (diff < 60) return "just now";
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
    });
  } catch {
    return iso;
  }
}

/**
 * Mobile-first list of the driver's own submissions.
 */
export default function DriverView() {
  const { invoices, loading } = useInvoices({
    endpoint: "/invoices?role=driver",
    pollMs: 5000,
  });

  const sorted = useMemo(
    () =>
      [...invoices].sort((a, b) => {
        const ta = new Date(a.updated_at || a.created_at || 0).getTime();
        const tb = new Date(b.updated_at || b.created_at || 0).getTime();
        return tb - ta;
      }),
    [invoices]
  );

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-400 font-sans">
      <Toaster position="top-center" theme="dark" />

      <header className="sticky top-0 z-30 bg-slate-950/85 backdrop-blur-xl border-b border-white/[0.06]">
        <div className="max-w-md mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <Truck size={15} className="text-emerald-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] text-white font-bold tracking-tight">
              My Challans
            </p>
            <p className="text-[10px] text-slate-500">
              Driver portal · {sorted.length}
            </p>
          </div>
        </div>
      </header>

      <main className="max-w-md mx-auto px-4 py-4 space-y-4">
        {/* Big CTA */}
        <motion.a
          href={WHATSAPP_DEEPLINK}
          target="_blank"
          rel="noreferrer"
          whileTap={{ scale: 0.98 }}
          className="block rounded-2xl p-5 bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-lg shadow-emerald-500/30"
          style={{
            boxShadow:
              "0 12px 30px -10px rgba(16,185,129,0.55), 0 0 0 1px rgba(16,185,129,0.4) inset",
          }}
        >
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/15 backdrop-blur flex items-center justify-center">
              <MessageSquare size={22} className="text-white" />
            </div>
            <div className="flex-1">
              <p className="text-[15px] text-white font-bold tracking-tight">
                Send a new challan
              </p>
              <p className="text-[11px] text-emerald-50/90">
                Tap to open WhatsApp
              </p>
            </div>
            <ChevronRight size={18} className="text-white/80" />
          </div>
        </motion.a>

        {/* Submission list */}
        <div className="space-y-2">
          {loading && (
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] py-12 text-center">
              <div className="w-5 h-5 mx-auto rounded-full border-2 border-white/[0.08] border-t-white animate-spin" />
            </div>
          )}

          {!loading && sorted.length === 0 && (
            <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] py-12 text-center">
              <p className="text-[12px] text-slate-500">No submissions yet.</p>
              <p className="text-[10px] text-slate-700 mt-1">
                Tap the green button above to send your first challan.
              </p>
            </div>
          )}

          {sorted.map((inv) => (
            <motion.div
              key={inv.id}
              layout
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl bg-white/[0.02] border border-white/[0.06] p-3 active:bg-white/[0.04] transition-colors"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] text-white font-semibold tracking-tight truncate">
                    {inv.vendor_name || "Unknown vendor"}
                  </p>
                  <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                    {inv.invoice_number || "—"}
                  </p>
                </div>
                <DocumentStatePill
                  state={inv.state || "PENDING"}
                  missingFields={inv.missing_fields || []}
                />
              </div>

              <div className="mt-2.5 flex items-center justify-between gap-3">
                <ConfidenceBar
                  confidence={inv.confidence_score}
                  width={120}
                />
                <span className="text-[10px] text-slate-600 font-mono shrink-0">
                  {formatRelative(inv.updated_at || inv.created_at)}
                </span>
              </div>
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
}

import { motion } from "framer-motion";
import { Shield, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Shared layout for every auth page.
 *
 * Left half (desktop): brand panel — shield, role tagline, some stats.
 * Right half: a clean card holding whatever form `children` are passed.
 * Mobile: stacks vertically; brand panel collapses.
 *
 * @param {object} props
 * @param {"vendor"|"driver"} props.role
 * @param {string} props.title
 * @param {string} props.subtitle
 * @param {string} [props.eyebrow]
 * @param {React.ReactNode} props.children
 * @param {React.ReactNode} [props.footer]
 */
export default function AuthShell({
  role,
  title,
  subtitle,
  eyebrow,
  children,
  footer,
}) {
  const isDriver = role === "driver";

  return (
    <div className="min-h-screen bg-white text-zinc-700 font-sans antialiased">
      {/* Top thin nav strip */}
      <header className="border-b border-zinc-200 bg-white sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center transition-transform group-hover:scale-105">
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
          <Link
            to="/"
            className="text-[12px] text-zinc-500 hover:text-zinc-900 transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft size={12} />
            Back to homepage
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-stretch">
          {/* ── Brand panel ─────────────────────────────────────────────── */}
          <BrandPanel role={role} eyebrow={eyebrow} isDriver={isDriver} />

          {/* ── Form card ──────────────────────────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="relative glass rounded-2xl p-6 sm:p-8 overflow-hidden">
              <div className="relative">
                <h1 className="text-[24px] sm:text-[26px] font-bold text-zinc-900 tracking-tight leading-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-1.5 text-[13px] text-zinc-600 leading-relaxed">
                    {subtitle}
                  </p>
                )}

                <div className="mt-6 space-y-5">{children}</div>

                {footer && (
                  <div className="mt-6 pt-5 border-t border-zinc-200 text-[12px] text-zinc-600">
                    {footer}
                  </div>
                )}
              </div>
            </div>
          </motion.section>
        </div>
      </main>
    </div>
  );
}

function BrandPanel({ eyebrow, isDriver }) {
  const tagline = isDriver
    ? "Send a challan photo. We do the rest."
    : "Unblocking supplier payments in India.";
  const subline = isDriver
    ? "Supplier drivers use WhatsApp to capture acceptance proof in seconds. AP sees the decision on the invoice before you finish the next delivery."
    : "TrustAudit helps Indian AP teams decide which supplier invoices are safe to pay: clear to claim, disputed, or still missing proof.";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="relative hidden lg:flex flex-col justify-between glass rounded-2xl p-8 overflow-hidden min-h-[560px]"
    >
      <div className="relative">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold tracking-wide bg-emerald-50 border-emerald-200 text-emerald-700">
          <span className="w-1.5 h-1.5 rounded-full pulse-dot bg-emerald-500" />
          {eyebrow ||
            (isDriver ? "Supplier driver portal" : "AP decision dashboard")}
        </div>

        <h2 className="mt-6 text-[34px] xl:text-[40px] leading-[1.05] font-bold text-zinc-900 tracking-tight">
          {tagline}
        </h2>
        <p className="mt-4 text-[14px] text-zinc-600 leading-relaxed max-w-md">
          {subline}
        </p>
      </div>

      {/* Shield medallion */}
      <div className="relative flex-1 flex items-center justify-center my-8">
        <div className="relative w-32 h-36 rounded-3xl bg-white border border-zinc-200 flex items-center justify-center shadow-sm">
          <Shield
            size={64}
            className="text-emerald-600"
            strokeWidth={1.5}
          />
        </div>
      </div>

      <div className="relative grid grid-cols-3 gap-3 text-center">
        <Stat label="Avg decision" value="14s" />
        <Stat label="Coverage" value="98.4%" />
        <Stat label="Cleared" value="₹2.4Cr" />
      </div>
    </motion.section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="glass rounded-xl px-3 py-3">
      <p className="text-[18px] font-bold text-zinc-900 tabular-nums tracking-tight leading-tight">
        {value}
      </p>
      <p className="text-[10px] text-zinc-500 uppercase tracking-widest mt-0.5">
        {label}
      </p>
    </div>
  );
}

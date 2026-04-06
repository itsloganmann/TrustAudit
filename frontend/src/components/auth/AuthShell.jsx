import { motion } from "framer-motion";
import { Shield, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

/**
 * Shared layout for every auth page.
 *
 * Left half (desktop): brand panel — giant shield, role tagline, marquee
 * gradient + soft animated radial glows.
 *
 * Right half: a glass card holding whatever form `children` are passed.
 *
 * Mobile: stacks vertically; brand panel collapses into a slim header.
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
  const accent = role === "driver" ? "amber" : "emerald";
  const accentColors = {
    emerald: {
      glow: "rgba(16, 185, 129, 0.18)",
      pill: "bg-emerald-500/10 border-emerald-500/20 text-emerald-300",
      ring: "rgba(16, 185, 129, 0.35)",
    },
    amber: {
      glow: "rgba(245, 158, 11, 0.18)",
      pill: "bg-amber-500/10 border-amber-500/20 text-amber-300",
      ring: "rgba(245, 158, 11, 0.35)",
    },
  }[accent];

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-400 font-sans antialiased">
      {/* Top thin nav strip */}
      <header className="border-b border-white/[0.06] bg-slate-950/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5 group">
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center transition-transform group-hover:scale-105">
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
          <Link
            to="/"
            className="text-[12px] text-slate-500 hover:text-slate-300 transition-colors flex items-center gap-1.5"
          >
            <ArrowLeft size={12} />
            Back to homepage
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-stretch">
          {/* ── Brand panel ─────────────────────────────────────────────── */}
          <BrandPanel
            role={role}
            accent={accent}
            accentColors={accentColors}
            eyebrow={eyebrow}
          />

          {/* ── Form card ──────────────────────────────────────────────── */}
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <div className="relative glass rounded-2xl p-6 sm:p-8 overflow-hidden">
              {/* gradient halo behind the card */}
              <div
                className="pointer-events-none absolute -top-32 -right-24 w-72 h-72 rounded-full"
                style={{
                  background: `radial-gradient(circle, ${accentColors.glow} 0%, transparent 65%)`,
                  filter: "blur(20px)",
                }}
              />
              <div className="relative">
                <h1 className="text-[24px] sm:text-[26px] font-bold text-white tracking-tight leading-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-1.5 text-[13px] text-slate-500 leading-relaxed">
                    {subtitle}
                  </p>
                )}

                <div className="mt-6 space-y-5">{children}</div>

                {footer && (
                  <div className="mt-6 pt-5 border-t border-white/[0.06] text-[12px] text-slate-500">
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

function BrandPanel({ role, accent, accentColors, eyebrow }) {
  const isDriver = role === "driver";
  const tagline = isDriver
    ? "Send a challan photo. We do the rest."
    : "Compliance for India's MSME supply chains.";
  const subline = isDriver
    ? "Drivers and field staff use WhatsApp to capture invoices in seconds. Your CFO sees a filing-ready 43B(h) PDF before you finish the next delivery."
    : "Every WhatsApp challan photo becomes a real-time Section 43B(h) compliance shield. Zero missed deadlines. Zero disallowed deductions.";

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="relative hidden lg:flex flex-col justify-between glass rounded-2xl p-8 overflow-hidden min-h-[560px]"
    >
      {/* Animated gradient mesh */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className="absolute -top-20 -left-16 w-[420px] h-[420px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${accentColors.glow} 0%, transparent 60%)`,
            filter: "blur(40px)",
            animation: "auth-glow-a 14s ease-in-out infinite",
          }}
        />
        <div
          className="absolute -bottom-24 -right-10 w-[360px] h-[360px] rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(59,130,246,0.16) 0%, transparent 60%)",
            filter: "blur(40px)",
            animation: "auth-glow-b 18s ease-in-out infinite",
          }}
        />
      </div>

      <style>{`
        @keyframes auth-glow-a {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, 30px) scale(1.08); }
        }
        @keyframes auth-glow-b {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(-26px, -18px) scale(1.05); }
        }
        @keyframes auth-shield-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-6px); }
        }
      `}</style>

      <div className="relative">
        <div
          className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] font-semibold tracking-wide ${accentColors.pill}`}
        >
          <span
            className="w-1.5 h-1.5 rounded-full pulse-dot"
            style={{ background: accentColors.ring }}
          />
          {eyebrow ||
            (isDriver ? "Supplier portal" : "Enterprise compliance")}
        </div>

        <h2 className="mt-6 text-[34px] xl:text-[40px] leading-[1.05] font-bold text-white tracking-tight">
          {tagline}
        </h2>
        <p className="mt-4 text-[14px] text-slate-400 leading-relaxed max-w-md">
          {subline}
        </p>
      </div>

      {/* Giant shield */}
      <div className="relative flex-1 flex items-center justify-center my-8">
        <div
          className="absolute w-[260px] h-[260px] rounded-full"
          style={{
            background: `radial-gradient(circle, ${accentColors.glow} 0%, transparent 60%)`,
            filter: "blur(30px)",
          }}
        />
        <div
          className="relative w-32 h-36 rounded-3xl glass border border-white/[0.08] flex items-center justify-center"
          style={{ animation: "auth-shield-float 6s ease-in-out infinite" }}
        >
          <Shield
            size={64}
            className={accent === "emerald" ? "text-emerald-400" : "text-amber-400"}
            strokeWidth={1.5}
          />
        </div>
      </div>

      <div className="relative grid grid-cols-3 gap-3 text-center">
        <Stat label="Avg verify" value="14s" />
        <Stat label="Coverage" value="98.4%" />
        <Stat label="Saved" value="₹2.4Cr" />
      </div>
    </motion.section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="glass rounded-xl px-3 py-3">
      <p className="text-[18px] font-bold text-white tabular-nums tracking-tight leading-tight">
        {value}
      </p>
      <p className="text-[10px] text-slate-500 uppercase tracking-widest mt-0.5">
        {label}
      </p>
    </div>
  );
}

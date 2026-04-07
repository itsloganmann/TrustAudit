import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  ShieldCheck,
  Zap,
} from "lucide-react";
import AnimatedCounter from "./AnimatedCounter";
import ComplianceChart from "./ComplianceChart";
import ActivityTicker from "./ActivityTicker";
import TaxSimulator from "./TaxSimulator";
import TiltCard from "./effects/TiltCard";

/* Shared spring presets — used across components for consistency */
const SPRING_CARD = { type: "spring", stiffness: 180, damping: 22 };
const SPRING_HOVER = { type: "spring", stiffness: 300, damping: 24 };

const STATUS_CONFIG = {
  PENDING: {
    label: "Pending",
    bg: "bg-rose-500/8",
    text: "text-rose-400",
    dot: "bg-rose-500",
    border: "border-rose-500/15",
    dotPulse: true,
  },
  VERIFIED: {
    label: "Verified",
    bg: "bg-emerald-500/8",
    text: "text-emerald-400",
    dot: "bg-emerald-500",
    border: "border-emerald-500/15",
    dotPulse: false,
  },
  PAID: {
    label: "Paid",
    bg: "bg-blue-500/8",
    text: "text-blue-400",
    dot: "bg-blue-500",
    border: "border-blue-500/15",
    dotPulse: false,
  },
};

function StatusBadge({ status }) {
  const c = STATUS_CONFIG[status] || STATUS_CONFIG.PENDING;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider ${c.bg} ${c.text} border ${c.border}`}>
      <span className={`w-1 h-1 rounded-full ${c.dot} ${c.dotPulse ? "pulse-dot" : ""}`} />
      {c.label}
    </span>
  );
}

function Deadline({ days, status }) {
  if (status === "VERIFIED") {
    return (
      <span className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1 justify-center">
        <ShieldCheck size={11} />
        Secured
      </span>
    );
  }
  if (days <= 0) {
    return (
      <div className="flex items-center gap-1.5 justify-center">
        <span className="w-1 h-1 rounded-full bg-rose-500 pulse-dot" />
        <span className="text-[11px] text-rose-400 font-bold">Overdue</span>
      </div>
    );
  }
  if (days <= 1) {
    return (
      <div className="flex flex-col items-center">
        <span className="text-[12px] text-rose-400 font-bold tabular-nums">{days}d</span>
        <div className="w-10 h-[3px] rounded-full bg-white/[0.04] mt-1 overflow-hidden">
          <div className="h-full bg-rose-500 rounded-full" style={{ width: "95%" }} />
        </div>
      </div>
    );
  }
  if (days <= 7) {
    return (
      <div className="flex flex-col items-center">
        <span className="text-[12px] text-amber-400 font-semibold tabular-nums">{days}d</span>
        <div className="w-10 h-[3px] rounded-full bg-white/[0.04] mt-1 overflow-hidden">
          <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(90, 50 + (7 - days) * 7)}%` }} />
        </div>
      </div>
    );
  }
  if (days <= 14) {
    return (
      <div className="flex flex-col items-center">
        <span className="text-[12px] text-slate-400 font-medium tabular-nums">{days}d</span>
        <div className="w-10 h-[3px] rounded-full bg-white/[0.04] mt-1 overflow-hidden">
          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(60, 20 + (14 - days) * 3)}%` }} />
        </div>
      </div>
    );
  }
  return <span className="text-[12px] text-slate-600 font-medium tabular-nums">{days}d</span>;
}

const STAT_ICONS = {
  total: FileText,
  verified: CheckCircle2,
  critical: AlertCircle,
  warning: AlertTriangle,
  safe: ShieldCheck,
  today: Zap,
};

function StatCard({ label, value, color, iconKey, index = 0 }) {
  const Icon = STAT_ICONS[iconKey] || FileText;
  const shouldReduceMotion = useReducedMotion();
  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ ...SPRING_CARD, delay: index * 0.04 }}
      className="will-change-transform"
    >
      <TiltCard
        glare
        maxTilt={6}
        scale={1.025}
        className="frost-card rounded-xl px-4 py-3 group block"
      >
        <div className="flex items-center justify-between mb-1 relative">
          <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">{label}</p>
          <Icon
            size={13}
            className="opacity-30 group-hover:opacity-60 transition-opacity"
            style={{ color: color || "#94a3b8" }}
          />
        </div>
        <div className="relative">
          <AnimatedCounter
            value={value}
            className="text-[22px] font-bold tabular-nums leading-tight tracking-tight inline-block"
            style={{ color: color || "#f8fafc" }}
            duration={700}
          />
        </div>
      </TiltCard>
    </motion.div>
  );
}

/* Row animation variants — stagger by index for cascading entry */
const rowVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: (i) => ({
    opacity: 1,
    x: 0,
    transition: { delay: Math.min(i, 20) * 0.04, type: "spring", stiffness: 260, damping: 24 },
  }),
  exit: { opacity: 0, x: 8, transition: { duration: 0.18 } },
};

/**
 * VerifiedBurst — emits 10 small emerald dots from the row's left edge
 * that drift up + outward and fade over ~720 ms. Pure SVG, runs once
 * per mount, GPU-cheap. Hidden under prefers-reduced-motion.
 */
function VerifiedBurst() {
  const shouldReduceMotion = useReducedMotion();
  if (shouldReduceMotion) return null;
  // Deterministic angle/distance per dot so the burst feels designed,
  // not random. Each dot has its own delay so they fan out.
  const dots = Array.from({ length: 10 }).map((_, i) => {
    const angle = (-Math.PI / 2) + ((i - 4.5) / 9) * (Math.PI * 0.85);
    const dist = 22 + (i % 3) * 6;
    return {
      id: i,
      tx: Math.cos(angle) * dist,
      ty: Math.sin(angle) * dist,
      delay: i * 0.025,
    };
  });
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 h-full w-16 overflow-visible"
      viewBox="0 0 64 48"
    >
      {dots.map((d) => (
        <motion.circle
          key={d.id}
          cx={6}
          cy={24}
          r={2.2}
          fill="#10b981"
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.6 }}
          animate={{
            opacity: [0, 0.95, 0],
            x: [0, d.tx],
            y: [0, d.ty],
            scale: [0.6, 1.1, 0.4],
          }}
          transition={{ duration: 0.72, delay: d.delay, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: "drop-shadow(0 0 6px rgba(16,185,129,0.8))" }}
        />
      ))}
    </svg>
  );
}

/**
 * InvoiceRow — wraps the table row so we can detect the moment a row
 * transitions PENDING → VERIFIED and trigger the particle burst exactly
 * once. The previous status lives in a ref so re-renders from polling
 * don't re-trigger the burst.
 */
function InvoiceRow({ inv, i, onSelect }) {
  const prevStatusRef = useRef(inv.status);
  const [showBurst, setShowBurst] = useState(false);

  useEffect(() => {
    const prev = prevStatusRef.current;
    if (prev !== "VERIFIED" && inv.status === "VERIFIED") {
      // Defer the setState into a RAF so it doesn't trigger a cascading
      // render synchronously inside the effect body.
      const startId = requestAnimationFrame(() => setShowBurst(true));
      const timeoutId = setTimeout(() => setShowBurst(false), 800);
      prevStatusRef.current = inv.status;
      return () => {
        cancelAnimationFrame(startId);
        clearTimeout(timeoutId);
      };
    }
    prevStatusRef.current = inv.status;
    return undefined;
  }, [inv.status]);

  return (
    <motion.tr
      custom={i}
      variants={rowVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      layout
      onClick={() => onSelect(inv)}
      whileHover={{
        backgroundColor: "rgba(255,255,255,0.02)",
        transition: { type: "spring", stiffness: 320, damping: 26 },
      }}
      className="row-transition border-b border-white/[0.04] cursor-pointer group relative"
    >
      {/* Risk indicator + vendor */}
      <td className="px-4 py-3 relative">
        {showBurst && <VerifiedBurst />}
        <div className="flex items-center gap-2.5">
          {inv.status === "PENDING" && inv.days_remaining <= 3 && (
            <motion.div
              layoutId={`risk-${inv.id}`}
              className="w-0.5 h-8 rounded-full bg-rose-500 -ml-2 mr-0.5"
            />
          )}
          {inv.status === "PENDING" && inv.days_remaining > 3 && inv.days_remaining <= 14 && (
            <div className="w-0.5 h-8 rounded-full bg-amber-500 -ml-2 mr-0.5" />
          )}
          {inv.status === "VERIFIED" && (
            <motion.div
              layoutId={`risk-${inv.id}`}
              className="w-0.5 h-8 rounded-full bg-emerald-500 -ml-2 mr-0.5"
              initial={{ backgroundColor: "#f43f5e" }}
              animate={{ backgroundColor: "#10b981" }}
              transition={{ duration: 1.2, ease: "easeOut" }}
            />
          )}
          <div>
            <p className="text-[13px] text-white font-medium group-hover:text-blue-400 transition-colors leading-tight tracking-tight">
              {inv.vendor_name}
            </p>
            <p className="text-[10px] text-slate-600 mt-0.5">{inv.invoice_date}</p>
          </div>
        </div>
      </td>
      <td className="px-3 py-3">
        <code className="text-[10px] text-slate-500 font-mono">{inv.gstin}</code>
      </td>
      <td className="px-3 py-3">
        <span className="text-[12px] text-slate-400 font-mono">{inv.invoice_number}</span>
      </td>
      <td className="px-3 py-3 text-right">
        <span className="text-[13px] text-white font-semibold tabular-nums tracking-tight">
          INR {inv.invoice_amount.toLocaleString("en-IN")}
        </span>
      </td>
      <td className="px-3 py-3 text-center">
        <Deadline days={inv.days_remaining} status={inv.status} />
      </td>
      <td className="px-4 py-3 text-center">
        <StatusBadge status={inv.status} />
      </td>
    </motion.tr>
  );
}

/* Grid card mount variants */
const gridCardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { ...SPRING_CARD, delay: i * 0.06 },
  }),
};

export default function Dashboard({ invoices, stats, activity, loading, onSelectInvoice }) {
  const shouldReduceMotion = useReducedMotion();
  const hoverProps = shouldReduceMotion
    ? {}
    : { whileHover: { y: -3, transition: SPRING_HOVER } };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-5 h-5 rounded-full border-2 border-white/[0.08] border-t-white animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Top Grid: Chart + Simulator + Ticker */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <motion.div
          className="lg:col-span-2 will-change-transform"
          custom={0}
          initial="hidden"
          animate="visible"
          variants={gridCardVariants}
          {...hoverProps}
        >
          <ComplianceChart stats={stats} />
        </motion.div>
        <motion.div
          className="lg:col-span-1 will-change-transform"
          custom={1}
          initial="hidden"
          animate="visible"
          variants={gridCardVariants}
          {...hoverProps}
        >
          <TaxSimulator stats={stats} />
        </motion.div>
        <motion.div
          className="lg:col-span-1 will-change-transform"
          custom={2}
          initial="hidden"
          animate="visible"
          variants={gridCardVariants}
          {...hoverProps}
        >
          <ActivityTicker activity={activity || []} />
        </motion.div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Total" value={stats.total_invoices || 0} iconKey="total" index={0} />
        <StatCard label="Verified" value={stats.verified_count || 0} color="#10b981" iconKey="verified" index={1} />
        <StatCard label="Critical" value={stats.critical_count || 0} color="#f43f5e" iconKey="critical" index={2} />
        <StatCard label="Warning" value={stats.warning_count || 0} color="#f59e0b" iconKey="warning" index={3} />
        <StatCard label="Safe" value={stats.safe_count || 0} color="#3b82f6" iconKey="safe" index={4} />
        <StatCard label="Today" value={stats.processed_today || 0} color="#8b5cf6" iconKey="today" index={5} />
      </div>

      {/* Invoice Table */}
      <motion.div
        className="glass rounded-xl overflow-hidden will-change-transform"
        initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
        animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={{ ...SPRING_CARD, delay: 0.2 }}
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/[0.06] text-[10px] text-slate-500 uppercase tracking-widest">
              <th className="text-left px-4 py-2.5 font-semibold">Vendor</th>
              <th className="text-left px-3 py-2.5 font-semibold">GSTIN</th>
              <th className="text-left px-3 py-2.5 font-semibold">Invoice</th>
              <th className="text-right px-3 py-2.5 font-semibold">Amount</th>
              <th className="text-center px-3 py-2.5 font-semibold">Deadline</th>
              <th className="text-center px-4 py-2.5 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody>
            <AnimatePresence mode="popLayout" initial={false}>
              {invoices.map((inv, i) => (
                <InvoiceRow key={inv.id} inv={inv} i={i} onSelect={onSelectInvoice} />
              ))}
            </AnimatePresence>
          </tbody>
        </table>

        {invoices.length === 0 && (
          <div className="px-4 py-12 text-center text-[13px] text-slate-600">
            No invoices match the current filter.
          </div>
        )}

        <div className="px-4 py-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-slate-600">
          <span>{invoices.length} results</span>
          <span className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
            Auto-refresh 2s
          </span>
        </div>
      </motion.div>
    </div>
  );
}

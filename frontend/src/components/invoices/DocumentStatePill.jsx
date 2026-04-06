import { motion } from "framer-motion";
import {
  Clock,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  Landmark,
  Flag,
} from "lucide-react";
import { useState } from "react";

/**
 * @typedef {"PENDING"|"VERIFYING"|"VERIFIED"|"NEEDS_INFO"|"SUBMITTED_TO_GOV"|"DISPUTED"} DocumentState
 */

const STATE_CONFIG = {
  PENDING: {
    label: "Pending",
    bg: "bg-slate-500/10",
    text: "text-slate-300",
    border: "border-slate-500/20",
    dot: "bg-slate-400",
    dotPulse: false,
    Icon: Clock,
    tooltip: "Awaiting initial document upload.",
  },
  VERIFYING: {
    label: "Verifying",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/25",
    dot: "bg-amber-400",
    dotPulse: true,
    Icon: Loader2,
    spin: true,
    tooltip: "Vision pipeline is extracting fields and running edge cases.",
  },
  VERIFIED: {
    label: "Verified",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    border: "border-emerald-500/25",
    dot: "bg-emerald-400",
    dotPulse: false,
    Icon: ShieldCheck,
    glow: "0 0 12px rgba(16,185,129,0.35), 0 0 24px rgba(16,185,129,0.18)",
    tooltip: "Fields extracted with high confidence. Ready for filing.",
  },
  NEEDS_INFO: {
    label: "Needs info",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/25",
    dot: "bg-amber-400",
    dotPulse: true,
    Icon: AlertTriangle,
    tooltip: "Some required fields could not be extracted.",
  },
  SUBMITTED_TO_GOV: {
    label: "Submitted",
    bg: "bg-[rgba(251,191,36,0.10)]",
    text: "text-amber-200",
    border: "border-amber-300/30",
    dot: "bg-amber-300",
    dotPulse: false,
    Icon: Landmark,
    glow: "0 0 14px rgba(251,191,36,0.35), 0 0 28px rgba(251,191,36,0.18)",
    shimmer: true,
    tooltip: "Filed with the government portal.",
  },
  DISPUTED: {
    label: "Disputed",
    bg: "bg-rose-500/10",
    text: "text-rose-300",
    border: "border-rose-500/25",
    dot: "bg-rose-400",
    dotPulse: true,
    Icon: Flag,
    tooltip: "A counterparty has raised a dispute on this document.",
  },
};

/**
 * Color-coded badge representing the current document state.
 *
 * @param {object} props
 * @param {DocumentState} props.state
 * @param {string[]} [props.missingFields]
 * @param {string} [props.layoutId]
 * @param {string} [props.className]
 */
export default function DocumentStatePill({
  state = "PENDING",
  missingFields = [],
  layoutId,
  className = "",
}) {
  const cfg = STATE_CONFIG[state] || STATE_CONFIG.PENDING;
  const [hovered, setHovered] = useState(false);

  const Icon = cfg.Icon;
  const tooltipBody =
    state === "NEEDS_INFO" && missingFields.length > 0
      ? `Missing: ${missingFields.join(", ")}`
      : cfg.tooltip;

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.span
        layoutId={layoutId}
        layout
        transition={{ type: "spring", stiffness: 380, damping: 30 }}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider border ${cfg.bg} ${cfg.text} ${cfg.border} ${className}`}
        style={cfg.glow ? { boxShadow: cfg.glow } : undefined}
      >
        <span
          className={`w-1 h-1 rounded-full ${cfg.dot} ${
            cfg.dotPulse ? "pulse-dot" : ""
          }`}
        />
        <Icon
          size={10}
          className={cfg.spin ? "animate-spin" : ""}
          strokeWidth={2.5}
        />
        <span className="leading-none">{cfg.label}</span>
        {cfg.shimmer && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-md pointer-events-none"
            initial={{ backgroundPosition: "-120% 0%" }}
            animate={{ backgroundPosition: "220% 0%" }}
            transition={{
              repeat: Infinity,
              repeatType: "loop",
              duration: 2.6,
              ease: "linear",
            }}
            style={{
              background:
                "linear-gradient(110deg, transparent 30%, rgba(255,255,255,0.18) 50%, transparent 70%)",
              backgroundSize: "200% 100%",
              mixBlendMode: "screen",
            }}
          />
        )}
      </motion.span>

      {hovered && tooltipBody && (
        <motion.span
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-50 whitespace-nowrap rounded-md border border-white/[0.08] bg-slate-900/95 px-2.5 py-1.5 text-[10px] text-slate-200 shadow-lg backdrop-blur"
          role="tooltip"
        >
          {tooltipBody}
        </motion.span>
      )}
    </span>
  );
}

export { STATE_CONFIG };

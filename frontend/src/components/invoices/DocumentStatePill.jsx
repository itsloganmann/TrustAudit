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
    bg: "bg-zinc-50",
    text: "text-zinc-700",
    border: "border-zinc-200",
    dot: "bg-zinc-400",
    dotPulse: false,
    Icon: Clock,
    tooltip: "Awaiting initial document upload.",
  },
  VERIFYING: {
    label: "Verifying",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-500",
    dotPulse: true,
    Icon: Loader2,
    spin: true,
    tooltip: "Vision pipeline is extracting fields and running edge cases.",
  },
  VERIFIED: {
    label: "Verified",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    dot: "bg-emerald-500",
    dotPulse: false,
    Icon: ShieldCheck,
    tooltip: "Fields extracted with high confidence. Ready for filing.",
  },
  NEEDS_INFO: {
    label: "Needs info",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-500",
    dotPulse: true,
    Icon: AlertTriangle,
    tooltip: "Some required fields could not be extracted.",
  },
  SUBMITTED_TO_GOV: {
    label: "Submitted",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-500",
    dotPulse: false,
    Icon: Landmark,
    tooltip: "Filed with the government portal.",
  },
  DISPUTED: {
    label: "Disputed",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    dot: "bg-red-500",
    dotPulse: true,
    Icon: Flag,
    tooltip: "A counterparty has raised a dispute on this document.",
  },
};

/**
 * Color-coded badge representing the current document state.
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
      </motion.span>

      {hovered && tooltipBody && (
        <motion.span
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-50 whitespace-nowrap rounded-md border border-zinc-200 bg-white px-2.5 py-1.5 text-[10px] text-zinc-700 shadow-sm"
          role="tooltip"
        >
          {tooltipBody}
        </motion.span>
      )}
    </span>
  );
}

export { STATE_CONFIG };

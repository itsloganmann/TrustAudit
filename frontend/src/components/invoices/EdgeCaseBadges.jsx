import { useState } from "react";
import { motion } from "framer-motion";
import {
  Info,
  AlertTriangle,
  ShieldAlert,
  EyeOff,
  ScanLine,
  Stamp,
  Calendar,
  PenLine,
  FileWarning,
  CircleHelp,
} from "lucide-react";

/**
 * @typedef {object} EdgeCaseResult
 * @property {string} case_id
 * @property {string} case_name
 * @property {"info"|"warning"|"block"} severity
 */

const SEVERITY_TOKENS = {
  info: {
    bg: "bg-blue-50",
    text: "text-blue-700",
    border: "border-blue-200",
    dot: "bg-blue-500",
  },
  warning: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  block: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    dot: "bg-red-500",
  },
};

const SEVERITY_ICON = {
  info: Info,
  warning: AlertTriangle,
  block: ShieldAlert,
};

const CASE_PRESETS = {
  blurry_image: { icon: EyeOff, label: "Blurry" },
  low_resolution: { icon: ScanLine, label: "LowRes" },
  missing_stamp: { icon: Stamp, label: "Stamp" },
  missing_signature: { icon: PenLine, label: "Sign" },
  date_mismatch: { icon: Calendar, label: "Date" },
  amount_mismatch: { icon: FileWarning, label: "Amount" },
  gstin_mismatch: { icon: FileWarning, label: "GSTIN" },
  duplicate_invoice: { icon: FileWarning, label: "Dup" },
  unknown_field: { icon: CircleHelp, label: "Unknown" },
};

function presetFor(edgeCase) {
  if (!edgeCase) return null;
  const preset = CASE_PRESETS[edgeCase.case_id];
  if (preset) return preset;
  const Icon = SEVERITY_ICON[edgeCase.severity] || Info;
  const fallback = (edgeCase.case_name || edgeCase.case_id || "Issue")
    .split(/[\s_-]+/)[0]
    .replace(/^\w/, (c) => c.toUpperCase())
    .slice(0, 9);
  return { icon: Icon, label: fallback };
}

function EdgeCaseChip({ edgeCase }) {
  const tokens =
    SEVERITY_TOKENS[edgeCase?.severity] || SEVERITY_TOKENS.info;
  const preset = presetFor(edgeCase);
  const Icon = preset.icon;
  const [hovered, setHovered] = useState(false);

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.span
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: "spring", stiffness: 360, damping: 24 }}
        className={`inline-flex items-center gap-1 px-1.5 py-[3px] rounded-md text-[9px] font-semibold uppercase tracking-wider border ${tokens.bg} ${tokens.text} ${tokens.border}`}
      >
        <Icon size={9} strokeWidth={2.5} />
        <span className="leading-none">{preset.label}</span>
      </motion.span>

      {hovered && (
        <motion.span
          initial={{ opacity: 0, y: -2 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-50 min-w-[180px] max-w-[260px] rounded-md border border-zinc-200 bg-white px-3 py-2 shadow-sm"
          role="tooltip"
        >
          <div className="flex items-center gap-1.5">
            <span className={`w-1 h-1 rounded-full ${tokens.dot}`} />
            <p className="text-[10px] font-semibold text-zinc-900 tracking-tight">
              {edgeCase.case_name || edgeCase.case_id}
            </p>
            <span
              className={`ml-auto text-[8px] uppercase tracking-wider ${tokens.text}`}
            >
              {edgeCase.severity}
            </span>
          </div>
          {edgeCase.rebut_message && (
            <p className="mt-1 text-[10px] text-zinc-600 leading-snug">
              {edgeCase.rebut_message}
            </p>
          )}
          {edgeCase.suggested_handler && (
            <p className="mt-1 text-[9px] text-zinc-500 font-mono">
              {edgeCase.suggested_handler}
            </p>
          )}
        </motion.span>
      )}
    </span>
  );
}

/**
 * Renders chips for an array of EdgeCaseResult objects.
 */
export default function EdgeCaseBadges({
  cases = [],
  max = 4,
  className = "",
}) {
  if (!cases || cases.length === 0) return null;
  const visible = cases.slice(0, max);
  const overflow = cases.length - visible.length;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {visible.map((c, i) => (
        <EdgeCaseChip key={c.case_id || i} edgeCase={c} />
      ))}
      {overflow > 0 && (
        <span className="inline-flex items-center px-1.5 py-[3px] rounded-md text-[9px] font-semibold uppercase tracking-wider border border-zinc-200 bg-zinc-50 text-zinc-600">
          +{overflow}
        </span>
      )}
    </div>
  );
}

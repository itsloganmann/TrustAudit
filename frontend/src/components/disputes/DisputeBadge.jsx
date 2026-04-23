import { Flag, CheckCircle2, Clock, Gavel } from "lucide-react";

const STATUS_TOKENS = {
  OPEN: {
    label: "Open",
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-200",
    Icon: Flag,
    pulse: true,
  },
  UNDER_REVIEW: {
    label: "Reviewing",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    Icon: Gavel,
    pulse: true,
  },
  AWAITING_EVIDENCE: {
    label: "Awaiting",
    bg: "bg-amber-50",
    text: "text-amber-700",
    border: "border-amber-200",
    Icon: Clock,
    pulse: false,
  },
  RESOLVED: {
    label: "Resolved",
    bg: "bg-emerald-50",
    text: "text-emerald-700",
    border: "border-emerald-200",
    Icon: CheckCircle2,
    pulse: false,
  },
  DISMISSED: {
    label: "Dismissed",
    bg: "bg-zinc-50",
    text: "text-zinc-500",
    border: "border-zinc-200",
    Icon: CheckCircle2,
    pulse: false,
  },
};

/**
 * Compact chip indicating dispute status.
 *
 * @param {object} props
 * @param {keyof STATUS_TOKENS} props.status
 * @param {string} [props.className]
 */
export default function DisputeBadge({ status = "OPEN", className = "" }) {
  const cfg = STATUS_TOKENS[status] || STATUS_TOKENS.OPEN;
  const Icon = cfg.Icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-[3px] rounded-md text-[9px] font-semibold uppercase tracking-wider border ${cfg.bg} ${cfg.text} ${cfg.border} ${className}`}
    >
      <span
        className={`w-1 h-1 rounded-full ${cfg.text.replace(
          "text-",
          "bg-"
        )} ${cfg.pulse ? "pulse-dot" : ""}`}
      />
      <Icon size={9} strokeWidth={2.5} />
      {cfg.label}
    </span>
  );
}

import { Flag, CheckCircle2, Clock, Gavel } from "lucide-react";

const STATUS_TOKENS = {
  OPEN: {
    label: "Open",
    bg: "bg-rose-500/10",
    text: "text-rose-300",
    border: "border-rose-500/25",
    Icon: Flag,
    pulse: true,
  },
  UNDER_REVIEW: {
    label: "Reviewing",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/25",
    Icon: Gavel,
    pulse: true,
  },
  AWAITING_EVIDENCE: {
    label: "Awaiting",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    border: "border-amber-500/25",
    Icon: Clock,
    pulse: false,
  },
  RESOLVED: {
    label: "Resolved",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    border: "border-emerald-500/25",
    Icon: CheckCircle2,
    pulse: false,
  },
  DISMISSED: {
    label: "Dismissed",
    bg: "bg-slate-500/10",
    text: "text-slate-400",
    border: "border-slate-500/20",
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

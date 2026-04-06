import { motion } from "framer-motion";
import {
  Inbox,
  ScanLine,
  ShieldCheck,
  AlertTriangle,
  Landmark,
  MessageSquare,
  Camera,
  CheckCircle2,
  Clock,
} from "lucide-react";

/**
 * @typedef {object} ChallanEvent
 * @property {string|number} id
 * @property {string} event_type
 * @property {string} occurred_at - ISO timestamp
 * @property {string} [description]
 * @property {string} [actor]
 */

const EVENT_ICONS = {
  RECEIVED: Inbox,
  WHATSAPP_RECEIVED: MessageSquare,
  PHOTO_UPLOADED: Camera,
  EXTRACTING: ScanLine,
  EXTRACTED: ScanLine,
  VERIFIED: ShieldCheck,
  NEEDS_INFO: AlertTriangle,
  SUBMITTED_TO_GOV: Landmark,
  ACK_FROM_GOV: CheckCircle2,
};

const EVENT_TONE = {
  RECEIVED: "slate",
  WHATSAPP_RECEIVED: "blue",
  PHOTO_UPLOADED: "blue",
  EXTRACTING: "amber",
  EXTRACTED: "amber",
  VERIFIED: "emerald",
  NEEDS_INFO: "amber",
  SUBMITTED_TO_GOV: "amber-gold",
  ACK_FROM_GOV: "emerald",
};

const TONE_CLASSES = {
  slate: {
    bg: "bg-slate-500/10",
    border: "border-slate-500/20",
    text: "text-slate-400",
    line: "bg-white/[0.06]",
  },
  blue: {
    bg: "bg-blue-500/10",
    border: "border-blue-500/25",
    text: "text-blue-300",
    line: "bg-blue-500/15",
  },
  amber: {
    bg: "bg-amber-500/10",
    border: "border-amber-500/25",
    text: "text-amber-300",
    line: "bg-amber-500/15",
  },
  "amber-gold": {
    bg: "bg-[rgba(251,191,36,0.10)]",
    border: "border-amber-300/30",
    text: "text-amber-200",
    line: "bg-amber-400/20",
  },
  emerald: {
    bg: "bg-emerald-500/10",
    border: "border-emerald-500/25",
    text: "text-emerald-300",
    line: "bg-emerald-500/20",
  },
};

function formatDateTime(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function humanize(eventType) {
  if (!eventType) return "Event";
  return eventType
    .toLowerCase()
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const itemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: { opacity: 1, x: 0 },
};

/**
 * Vertical timeline of challan events.
 *
 * @param {object} props
 * @param {ChallanEvent[]} [props.events]
 * @param {string} [props.className]
 */
export default function ChallanTimeline({ events = [], className = "" }) {
  if (!events || events.length === 0) {
    return (
      <div
        className={`rounded-xl bg-white/[0.02] border border-white/[0.06] p-6 text-center ${className}`}
      >
        <Clock size={16} className="mx-auto text-slate-700 mb-2" />
        <p className="text-[11px] text-slate-600">
          No challan events recorded yet.
        </p>
      </div>
    );
  }

  return (
    <motion.ol
      className={`relative ${className}`}
      initial="hidden"
      animate="visible"
      transition={{ staggerChildren: 0.07 }}
    >
      {events.map((ev, idx) => {
        const tone = TONE_CLASSES[EVENT_TONE[ev.event_type] || "slate"];
        const Icon = EVENT_ICONS[ev.event_type] || Clock;
        const isLast = idx === events.length - 1;

        return (
          <motion.li
            key={ev.id || idx}
            variants={itemVariants}
            transition={{ type: "spring", stiffness: 360, damping: 26 }}
            className="relative flex gap-3 pb-4 last:pb-0"
          >
            <div className="flex flex-col items-center">
              <div
                className={`relative z-10 w-7 h-7 rounded-lg flex items-center justify-center border ${tone.bg} ${tone.border}`}
              >
                <Icon size={12} className={tone.text} strokeWidth={2.5} />
              </div>
              {!isLast && (
                <div className={`flex-1 w-px mt-1 ${tone.line}`} />
              )}
            </div>

            <div className="flex-1 min-w-0 -mt-0.5">
              <div className="flex items-baseline justify-between gap-3">
                <p
                  className={`text-[11px] font-semibold tracking-tight ${tone.text}`}
                >
                  {humanize(ev.event_type)}
                </p>
                <time className="text-[9px] text-slate-600 font-mono shrink-0 tabular-nums">
                  {formatDateTime(ev.occurred_at)}
                </time>
              </div>
              {ev.description && (
                <p className="mt-0.5 text-[10px] text-slate-500 leading-snug">
                  {ev.description}
                </p>
              )}
              {ev.actor && (
                <p className="mt-0.5 text-[9px] text-slate-700 font-mono">
                  by {ev.actor}
                </p>
              )}
            </div>
          </motion.li>
        );
      })}
    </motion.ol>
  );
}

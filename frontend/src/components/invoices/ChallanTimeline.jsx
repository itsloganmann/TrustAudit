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
  RECEIVED: "neutral",
  WHATSAPP_RECEIVED: "info",
  PHOTO_UPLOADED: "info",
  EXTRACTING: "amber",
  EXTRACTED: "amber",
  VERIFIED: "emerald",
  NEEDS_INFO: "amber",
  SUBMITTED_TO_GOV: "amber",
  ACK_FROM_GOV: "emerald",
};

const TONE_CLASSES = {
  neutral: {
    bg: "bg-zinc-50",
    border: "border-zinc-200",
    text: "text-zinc-600",
    line: "bg-zinc-200",
  },
  info: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-700",
    line: "bg-blue-200",
  },
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-700",
    line: "bg-amber-200",
  },
  emerald: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-700",
    line: "bg-emerald-200",
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
 */
export default function ChallanTimeline({ events = [], className = "" }) {
  if (!events || events.length === 0) {
    return (
      <div
        className={`rounded-xl bg-white border border-zinc-200 p-6 text-center ${className}`}
      >
        <Clock size={16} className="mx-auto text-zinc-400 mb-2" />
        <p className="text-[11px] text-zinc-500">
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
        const tone = TONE_CLASSES[EVENT_TONE[ev.event_type] || "neutral"];
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
                <time className="text-[9px] text-zinc-500 font-mono shrink-0 tabular-nums">
                  {formatDateTime(ev.occurred_at)}
                </time>
              </div>
              {ev.description && (
                <p className="mt-0.5 text-[10px] text-zinc-600 leading-snug">
                  {ev.description}
                </p>
              )}
              {ev.actor && (
                <p className="mt-0.5 text-[9px] text-zinc-500 font-mono">
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

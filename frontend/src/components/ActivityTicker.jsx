import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  CheckCircle2,
  ArrowRight,
  AlertTriangle,
  XCircle,
  Radio,
} from "lucide-react";

const TYPE_CONFIG = {
  success: { color: "#10b981", Icon: CheckCircle2, tag: "OK" },
  info:    { color: "#3b82f6", Icon: ArrowRight,    tag: "IN" },
  warning: { color: "#f59e0b", Icon: AlertTriangle, tag: "WN" },
  error:   { color: "#f43f5e", Icon: XCircle,       tag: "ER" },
};

function timeAgo(ts) {
  const s = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  return `${Math.floor(m / 60)}h ago`;
}

export default function ActivityTicker({ activity }) {
  const [displayItems, setDisplayItems] = useState([]);
  const prevLength = useRef(0);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (activity.length !== prevLength.current) {
      setDisplayItems(activity.slice(0, 10));
      prevLength.current = activity.length;
    }
  }, [activity]);

  return (
    <div className="glass rounded-xl overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="relative">
            <div className="w-2 h-2 rounded-full bg-emerald-400" />
            <div className="absolute inset-0 w-2 h-2 rounded-full bg-emerald-400 animate-ping opacity-40" />
          </div>
          <span className="text-[12px] text-white font-semibold tracking-tight">
            Transaction Stream
          </span>
          <span className="text-[9px] text-emerald-400 font-semibold uppercase tracking-widest bg-emerald-500/10 px-1.5 py-0.5 rounded border border-emerald-500/20">
            Live
          </span>
        </div>
        <span className="text-[9px] text-slate-600 font-mono tabular-nums">
          {activity.length} events
        </span>
      </div>

      {/* Stream */}
      <div className="flex-1 overflow-hidden">
        <div className="p-1.5 space-y-0.5 max-h-[320px] overflow-y-auto">
          <AnimatePresence mode="popLayout" initial={false}>
            {displayItems.map((item, i) => {
              const cfg = TYPE_CONFIG[item.type] || TYPE_CONFIG.info;
              const Icon = cfg.Icon;
              return (
                <motion.div
                  key={`${item.timestamp}-${item.message}-${i}`}
                  initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.97 }}
                  animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
                  exit={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
                  transition={
                    shouldReduceMotion
                      ? { duration: 0.18 }
                      : {
                          type: "spring",
                          stiffness: 260,
                          damping: 24,
                          delay: i * 0.02,
                        }
                  }
                  layout
                  className="flex items-start gap-2.5 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition-colors group will-change-transform"
                >
                  {/* Icon */}
                  <div
                    className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                    style={{
                      background: `${cfg.color}10`,
                    }}
                  >
                    <Icon size={10} style={{ color: cfg.color }} />
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] text-slate-400 leading-relaxed truncate group-hover:text-slate-300 transition-colors">
                      {item.message}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span
                        className="text-[8px] font-bold font-mono uppercase tracking-wider"
                        style={{ color: cfg.color }}
                      >
                        {cfg.tag}
                      </span>
                      <span className="text-[9px] text-slate-700 font-mono">
                        {timeAgo(item.timestamp)}
                      </span>
                    </div>
                  </div>

                  {/* Pulse for errors */}
                  {item.type === "error" && (
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 pulse-dot mt-2 shrink-0" />
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>

          {displayItems.length === 0 && (
            <div className="text-center py-10">
              <Radio size={16} className="text-slate-700 mx-auto mb-2" />
              <p className="text-[11px] text-slate-600">Waiting for events...</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

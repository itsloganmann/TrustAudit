import { useEffect, useRef, useState } from "react";
import { motion, useInView } from "framer-motion";

/**
 * Animated counter stat strip. Avoids importing the existing
 * AnimatedCounter component (restructuring its exports would touch a
 * forbidden file). Instead we run a tiny RAF loop inline here.
 */

function useCountUp(target, durationMs, shouldStart) {
  const [display, setDisplay] = useState(0);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!shouldStart) return;
    const start = performance.now();
    const from = 0;
    const step = (now) => {
      const p = Math.min((now - start) / durationMs, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (target - from) * eased);
      if (p < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, durationMs, shouldStart]);

  return display;
}

function Stat({ label, value, prefix = "", suffix = "", decimals = 0, color = "#f8fafc", shouldStart }) {
  const display = useCountUp(value, 1400, shouldStart);
  const formatted = display.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <div className="text-center md:text-left">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium mb-1.5">
        {label}
      </p>
      <p
        className="text-[30px] md:text-[34px] font-bold tabular-nums leading-none tracking-tight"
        style={{ color }}
      >
        {prefix}
        {formatted}
        {suffix}
      </p>
    </div>
  );
}

const DEFAULT_STATS = [
  { label: "Tax shielded", value: 12.4, prefix: "INR ", suffix: " Cr", decimals: 1, color: "#10b981" },
  { label: "Invoices verified", value: 2847, color: "#f8fafc" },
  { label: "Avg OCR latency", value: 14, suffix: "s", color: "#3b82f6" },
  { label: "Accuracy", value: 96.4, suffix: "%", decimals: 1, color: "#8b5cf6" },
];

export default function StatsStrip({ stats = DEFAULT_STATS, compact = false }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, amount: 0.4 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      animate={inView ? { opacity: 1, y: 0 } : {}}
      transition={{ type: "spring", stiffness: 80, damping: 18 }}
      className={`glass rounded-2xl ${compact ? "px-5 py-4" : "px-8 py-6"} grid grid-cols-2 md:grid-cols-4 gap-5 md:gap-8`}
    >
      {stats.map((s) => (
        <Stat key={s.label} {...s} shouldStart={inView} />
      ))}
    </motion.div>
  );
}

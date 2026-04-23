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

function Stat({ label, value, prefix = "", suffix = "", decimals = 0, color = "#09090b", shouldStart }) {
  const display = useCountUp(value, 1400, shouldStart);
  const formatted = display.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return (
    <div className="text-center md:text-left">
      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-medium mb-1.5">
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
  { label: "Flow we sit under", value: 90, prefix: "$", suffix: "B", color: "#047857" },
  { label: "Invoices ingested", value: 2847, color: "#09090b" },
  { label: "Sectors in pilot", value: 3, color: "#09090b" },
  { label: "Match rate", value: 96.4, suffix: "%", decimals: 1, color: "#047857" },
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

import { useState, useEffect, useRef } from "react";
import { motion, useReducedMotion, useSpring, useMotionValue } from "framer-motion";

/**
 * AnimatedCounter — Round 4 upgrade.
 *
 * - Spring-based interpolation (instead of the prior linear quint-out)
 *   so the number "lands" with a tactile bounce.
 * - Milestone flash: when the displayed integer crosses a power-of-10
 *   boundary (10, 100, 1000, ...) we briefly scale to 1.18 with an
 *   emerald drop-shadow, then spring back. The drop-shadow uses GPU
 *   compositing so it doesn't trigger layout thrash.
 * - Respects prefers-reduced-motion: snaps to the new value, no flash.
 */
const SPRING = { stiffness: 90, damping: 18, mass: 1 };

function isMilestoneCrossed(prev, next) {
  // Cross 10, 100, 1000, 10_000, ...
  if (prev === next) return false;
  const lo = Math.min(prev, next);
  const hi = Math.max(prev, next);
  for (let p = 10; p <= 1_000_000; p *= 10) {
    if (lo < p && hi >= p) return true;
  }
  return false;
}

export default function AnimatedCounter({
  value, prefix = "", suffix = "",
  decimals = 0, className = "", style = {},
  // ``duration`` retained for API compat with the old call sites in
  // Dashboard.jsx, but the spring ignores it.
  // eslint-disable-next-line no-unused-vars
  duration,
}) {
  const shouldReduceMotion = useReducedMotion();
  const [displayValue, setDisplayValue] = useState(typeof value === "number" ? value : 0);
  const [flashKey, setFlashKey] = useState(0);
  const prevRef = useRef(typeof value === "number" ? value : 0);

  // Spring-driven motion value that the number text reads from each frame.
  const motionVal = useMotionValue(typeof value === "number" ? value : 0);
  const spring = useSpring(motionVal, SPRING);

  useEffect(() => {
    if (typeof value !== "number" || Number.isNaN(value)) return undefined;
    if (shouldReduceMotion) {
      motionVal.set(value);
      // Defer the setState into a RAF so we don't trigger a cascading
      // render synchronously inside the effect body.
      const id = requestAnimationFrame(() => setDisplayValue(value));
      prevRef.current = value;
      return () => cancelAnimationFrame(id);
    }

    const prev = prevRef.current;
    let flashRaf = 0;
    if (isMilestoneCrossed(prev, value)) {
      // Defer the milestone-key bump into a RAF so it doesn't trigger
      // a cascading render synchronously inside the effect body.
      flashRaf = requestAnimationFrame(() => setFlashKey((k) => k + 1));
    }
    motionVal.set(value);
    prevRef.current = value;

    const unsubscribe = spring.on("change", (latest) => {
      setDisplayValue(latest);
    });
    return () => {
      if (flashRaf) cancelAnimationFrame(flashRaf);
      unsubscribe();
    };
  }, [value, shouldReduceMotion, motionVal, spring]);

  const formatted = (Number.isFinite(displayValue) ? displayValue : 0).toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  if (shouldReduceMotion) {
    return (
      <span className={className} style={style}>
        {prefix}{formatted}{suffix}
      </span>
    );
  }

  // The motion.span gets a brief scale-up + emerald glow keyed to flashKey
  // so consecutive milestones each retrigger the keyframe.
  return (
    <motion.span
      key={flashKey}
      className={className}
      style={style}
      initial={{ scale: 1, filter: "drop-shadow(0 0 0 rgba(16,185,129,0))" }}
      animate={{
        scale: [1, 1.18, 1],
        filter: [
          "drop-shadow(0 0 0 rgba(16,185,129,0))",
          "drop-shadow(0 0 12px rgba(16,185,129,0.55))",
          "drop-shadow(0 0 0 rgba(16,185,129,0))",
        ],
      }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
    >
      {prefix}{formatted}{suffix}
    </motion.span>
  );
}

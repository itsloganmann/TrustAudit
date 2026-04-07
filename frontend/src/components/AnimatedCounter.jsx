import { useState, useEffect, useRef } from "react";
import { useReducedMotion } from "framer-motion";

export default function AnimatedCounter({
  value, prefix = "", suffix = "", duration = 900,
  decimals = 0, className = "", style = {},
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const prev = useRef(0);
  const raf = useRef(null);
  const shouldReduceMotion = useReducedMotion();

  useEffect(() => {
    if (shouldReduceMotion) {
      // Defer setState into a RAF so we don't trigger a cascading render
      // inside the effect body (satisfies react-hooks/set-state-in-effect).
      raf.current = requestAnimationFrame(() => {
        setDisplayValue(value);
        prev.current = value;
      });
      return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    }
    const start = prev.current;
    const end = value;
    const t0 = performance.now();
    // Snappier easing: quint out for tighter, more responsive feel
    const animate = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 5);
      setDisplayValue(start + (end - start) * eased);
      if (p < 1) raf.current = requestAnimationFrame(animate);
      else prev.current = end;
    };
    raf.current = requestAnimationFrame(animate);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration, shouldReduceMotion]);

  const formatted = displayValue.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return <span className={className} style={style}>{prefix}{formatted}{suffix}</span>;
}

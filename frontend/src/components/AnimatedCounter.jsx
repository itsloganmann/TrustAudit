import { useState, useEffect, useRef } from "react";

export default function AnimatedCounter({
  value, prefix = "", suffix = "", duration = 1200,
  decimals = 0, className = "", style = {},
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const prev = useRef(0);
  const raf = useRef(null);

  useEffect(() => {
    const start = prev.current;
    const end = value;
    const t0 = performance.now();
    const animate = (now) => {
      const p = Math.min((now - t0) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplayValue(start + (end - start) * eased);
      if (p < 1) raf.current = requestAnimationFrame(animate);
      else prev.current = end;
    };
    raf.current = requestAnimationFrame(animate);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [value, duration]);

  const formatted = displayValue.toLocaleString("en-IN", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

  return <span className={className} style={style}>{prefix}{formatted}{suffix}</span>;
}

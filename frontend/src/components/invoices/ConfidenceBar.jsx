import { motion } from "framer-motion";

/**
 * Horizontal confidence bar with red→amber→green gradient.
 *
 * @param {object} props
 * @param {number|null|undefined} props.confidence - 0..1
 * @param {number} [props.width=100]
 * @param {number} [props.threshold=0.85]
 * @param {boolean} [props.showLabel=true]
 * @param {string} [props.className]
 */
export default function ConfidenceBar({
  confidence,
  width = 100,
  threshold = 0.85,
  showLabel = true,
  className = "",
}) {
  const hasValue =
    confidence !== null && confidence !== undefined && !Number.isNaN(confidence);
  const pct = hasValue ? Math.max(0, Math.min(1, confidence)) : 0;

  if (!hasValue) {
    return (
      <div className={`flex items-center gap-2 ${className}`}>
        <div
          className="h-[6px] rounded-full border border-dashed border-white/[0.10]"
          style={{ width }}
          aria-label="No confidence score yet"
        />
        {showLabel && (
          <span className="text-[10px] text-slate-600 tabular-nums font-mono">
            --%
          </span>
        )}
      </div>
    );
  }

  // Color the percentage label by tier
  const labelColor =
    pct >= threshold
      ? "text-emerald-400"
      : pct >= 0.6
      ? "text-amber-400"
      : "text-rose-400";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="relative h-[6px] rounded-full bg-white/[0.05] overflow-hidden ring-1 ring-inset ring-white/[0.04]"
        style={{ width }}
        role="progressbar"
        aria-valuenow={Math.round(pct * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct * 100}%` }}
          transition={{ type: "spring", stiffness: 140, damping: 22 }}
          style={{
            background:
              "linear-gradient(90deg, #f43f5e 0%, #f59e0b 50%, #10b981 100%)",
            backgroundSize: `${100 / Math.max(pct, 0.01)}% 100%`,
            boxShadow:
              pct >= threshold
                ? "0 0 8px rgba(16,185,129,0.45)"
                : pct >= 0.6
                ? "0 0 6px rgba(245,158,11,0.35)"
                : "0 0 6px rgba(244,63,94,0.35)",
          }}
        />
        {/* Threshold marker */}
        <div
          className="absolute inset-y-0 w-px bg-white/[0.18]"
          style={{ left: `${threshold * 100}%` }}
          aria-hidden
        />
      </div>
      {showLabel && (
        <span
          className={`text-[10px] tabular-nums font-mono font-semibold ${labelColor}`}
        >
          {Math.round(pct * 100)}%
        </span>
      )}
    </div>
  );
}

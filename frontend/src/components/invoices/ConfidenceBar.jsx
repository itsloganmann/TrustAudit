import { motion } from "framer-motion";

/**
 * Horizontal confidence bar with red→amber→emerald gradient.
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
          className="h-[6px] rounded-full border border-dashed border-zinc-200"
          style={{ width }}
          aria-label="No confidence score yet"
        />
        {showLabel && (
          <span className="text-[10px] text-zinc-400 tabular-nums font-mono">
            --%
          </span>
        )}
      </div>
    );
  }

  // Color the percentage label by tier
  const labelColor =
    pct >= threshold
      ? "text-emerald-700"
      : pct >= 0.6
      ? "text-amber-700"
      : "text-red-700";

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div
        className="relative h-[6px] rounded-full bg-zinc-100 overflow-hidden ring-1 ring-inset ring-zinc-200"
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
              "linear-gradient(90deg, #dc2626 0%, #d97706 50%, #059669 100%)",
            backgroundSize: `${100 / Math.max(pct, 0.01)}% 100%`,
          }}
        />
        {/* Threshold marker */}
        <div
          className="absolute inset-y-0 w-px bg-zinc-400"
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

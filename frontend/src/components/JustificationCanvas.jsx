import { motion } from "framer-motion";
import { Sparkles, AlertTriangle, CheckCircle2, ArrowRight } from "lucide-react";
import { cn } from "../lib/cn";

/* ─────────────────────────────────────────────
   JustificationCanvas — light theme.

   Pure 2D: an SVG radial confidence gauge, animated field bars, and a
   recommendation rail. Same prop contract as before.
   ───────────────────────────────────────────── */

const EMERALD = "#059669";
const EMERALD_DEEP = "#047857";
const AMBER = "#d97706";
const MINT = "#10b981";
const CORAL = "#dc2626";

function formatInr(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "INR 0";
  return `INR ${n.toLocaleString("en-IN")}`;
}

function confidenceColor(c) {
  if (c >= 0.85) return EMERALD;
  if (c >= 0.55) return AMBER;
  return CORAL;
}

function severityChip(severity) {
  if (severity === "critical") return "border-red-200 text-red-700 bg-red-50";
  if (severity === "warning") return "border-amber-200 text-amber-700 bg-amber-50";
  return "border-emerald-200 text-emerald-700 bg-emerald-50";
}

/* ── Radial confidence gauge ── */
function ConfidenceGauge({ confidence }) {
  const value = Math.max(0, Math.min(1, Number(confidence) || 0));
  const pct = Math.round(value * 100);
  const radius = 78;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value);
  const color = confidenceColor(value);

  return (
    <div className="relative w-[200px] h-[200px] mx-auto">
      <svg viewBox="0 0 200 200" className="w-full h-full -rotate-90">
        <defs>
          <linearGradient id="gauge-fill" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={EMERALD_DEEP} />
          </linearGradient>
        </defs>
        {/* Track */}
        <circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="#e4e4e7"
          strokeWidth="6"
        />
        {/* Fill */}
        <motion.circle
          cx="100"
          cy="100"
          r={radius}
          fill="none"
          stroke="url(#gauge-fill)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <p className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 font-semibold">
          Confidence
        </p>
        <p className="aurora-headline text-[64px] leading-none text-zinc-900 tabular-nums">
          {pct}
          <span className="text-[28px] text-zinc-500">%</span>
        </p>
      </div>
    </div>
  );
}

/* ── Field bar list ── */
function FieldBar({ field, missing }) {
  const conf = Number(field?.confidence) || 0;
  const pct = missing ? 0 : Math.max(8, Math.min(100, conf * 100));
  const color = missing ? CORAL : confidenceColor(conf);
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="space-y-1.5"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-medium text-zinc-700 tracking-wide uppercase">
          {field?.label || field?.field_name || "field"}
        </span>
        {missing ? (
          <span className="text-[10px] font-mono text-red-700 tabular-nums">
            {formatInr(field?.impact_inr)}
          </span>
        ) : (
          <span className="text-[10px] font-mono text-zinc-500 tabular-nums">
            {Math.round(conf * 100)}%
          </span>
        )}
      </div>
      <div className="h-1 rounded-full bg-zinc-100 overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1.1, ease: [0.22, 1, 0.36, 1] }}
          className="h-full rounded-full"
          style={{
            background: color,
          }}
        />
      </div>
    </motion.div>
  );
}

/* ── Fallback for unsupported environments ── */
function Fallback({ confidence, deductionInr, totalRecoverableInr, missingFields }) {
  return (
    <div className="w-full rounded-2xl border border-zinc-200 bg-white p-6 text-center">
      <p className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 font-semibold">
        Decision snapshot
      </p>
      <p className="aurora-headline text-[48px] text-zinc-900 tabular-nums leading-none mt-2">
        {Math.round((Number(confidence) || 0) * 100)}%
      </p>
      <p className="mt-1 text-[11px] text-zinc-600">
        confidence · {formatInr(deductionInr)} deductible
      </p>
      {Number(totalRecoverableInr) > 0 && (
        <p className="text-[10px] text-amber-700 mt-1 font-mono">
          {formatInr(totalRecoverableInr)} recoverable
        </p>
      )}
      {Array.isArray(missingFields) && missingFields.length > 0 && (
        <p className="text-[10px] text-red-700 mt-2">
          {missingFields.length} missing field{missingFields.length === 1 ? "" : "s"}
        </p>
      )}
    </div>
  );
}

export default function JustificationCanvas({
  invoiceId,
  confidence = 0,
  deductionInr = 0,
  totalRecoverableInr = 0,
  availableFields = [],
  missingFields = [],
  recommendations = [],
  className,
}) {
  const safeAvailable = Array.isArray(availableFields) ? availableFields : [];
  const safeMissing = Array.isArray(missingFields) ? missingFields : [];
  const safeRecs = Array.isArray(recommendations) ? recommendations : [];

  if (!safeAvailable.length && !safeMissing.length && !safeRecs.length) {
    return (
      <div className={cn("w-full", className)} data-invoice-id={invoiceId}>
        <Fallback
          confidence={confidence}
          deductionInr={deductionInr}
          totalRecoverableInr={totalRecoverableInr}
          missingFields={missingFields}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full rounded-2xl border border-zinc-200 bg-white p-6 relative overflow-hidden",
        className
      )}
      data-invoice-id={invoiceId}
    >
      <div className="relative grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6 items-start">
        {/* Left: gauge + headline numbers */}
        <div className="space-y-4">
          <ConfidenceGauge confidence={confidence} />
          <div className="text-center space-y-1">
            <p className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 font-semibold">
              43B(h) deduction estimate
            </p>
            <p className="aurora-headline text-[28px] text-emerald-700 tabular-nums leading-none">
              {formatInr(deductionInr)}
            </p>
            {Number(totalRecoverableInr) > 0 && (
              <p className="text-[10px] text-zinc-500 font-mono">
                +{formatInr(totalRecoverableInr)} recoverable
              </p>
            )}
          </div>
        </div>

        {/* Right: field bars + recommendations */}
        <div className="space-y-5">
          {safeAvailable.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 size={11} className="text-emerald-700" />
                <p className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 font-semibold">
                  Extracted ({safeAvailable.length})
                </p>
              </div>
              <div className="space-y-3">
                {safeAvailable.map((field, i) => (
                  <FieldBar key={`a-${field?.field_name || i}`} field={field} />
                ))}
              </div>
            </div>
          )}

          {safeMissing.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={11} className="text-red-700" />
                <p className="text-[9px] uppercase tracking-[0.3em] text-red-700 font-semibold">
                  Missing ({safeMissing.length})
                </p>
              </div>
              <div className="space-y-3">
                {safeMissing.map((field, i) => (
                  <FieldBar key={`m-${field?.field_name || i}`} field={field} missing />
                ))}
              </div>
            </div>
          )}

          {safeRecs.length > 0 && (
            <div className="pt-2 border-t border-zinc-200">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={11} className="text-emerald-700" />
                <p className="text-[9px] uppercase tracking-[0.3em] text-zinc-500 font-semibold">
                  Recommendations
                </p>
              </div>
              <div className="space-y-2">
                {safeRecs.slice(0, 3).map((rec, i) => (
                  <motion.div
                    key={`r-${i}`}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className={cn(
                      "rounded border px-3 py-2 flex items-center gap-3",
                      severityChip(rec.severity),
                    )}
                  >
                    <ArrowRight size={11} className="shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-semibold tracking-tight truncate">
                        {rec.title}
                      </p>
                    </div>
                    {Number(rec.amount_inr) > 0 && (
                      <span className="text-[10px] font-mono tabular-nums shrink-0">
                        {formatInr(rec.amount_inr)}
                      </span>
                    )}
                  </motion.div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

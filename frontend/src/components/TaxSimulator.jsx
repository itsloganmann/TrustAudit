import { useState, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Gauge, TrendingUp, AlertTriangle } from "lucide-react";

/**
 * 43B(h) cliff estimator:
 * - MSME payments within 15 days (no agreement) or 45 days (with agreement): fully deductible
 * - Beyond the deadline: entire amount becomes non-deductible, 30% corporate tax hit
 * - One of several use cases TrustAudit surfaces; the core product is deciding
 *   which supplier invoices are safe to pay.
 */
function calculateRisk(delayDays, portfolioValue) {
  const portfolio = portfolioValue || 1_200_000;

  if (delayDays <= 15) {
    return {
      risk: Math.round(portfolio * (delayDays / 100) * 0.02),
      zone: "safe",
      label: "Inside window",
      color: "#047857",
      bgColor: "#ecfdf5",
      borderColor: "#a7f3d0",
      description: "Payments land inside the 43B(h) window. Deductions preserved.",
    };
  }

  if (delayDays <= 44) {
    const progress = (delayDays - 15) / 30;
    return {
      risk: Math.round(portfolio * progress * 0.08),
      zone: "warning",
      label: "Window closing",
      color: "#b45309",
      bgColor: "#fffbeb",
      borderColor: "#fde68a",
      description: `${45 - delayDays} days until the 43B(h) window closes. Prioritize these suppliers.`,
    };
  }

  if (delayDays <= 45) {
    return {
      risk: Math.round(portfolio * 0.30),
      zone: "critical",
      label: "Window closed",
      color: "#b91c1c",
      bgColor: "#fef2f2",
      borderColor: "#fecaca",
      description: "43B(h) triggered. MSME payable is now non-deductible, 30% tax exposure.",
    };
  }

  const baseRisk = portfolio * 0.30;
  const escalation = 1 + ((delayDays - 45) / 55) * 0.8;
  const interestPenalty = portfolio * ((delayDays - 45) / 365) * 0.18;

  return {
    risk: Math.round(baseRisk * escalation + interestPenalty),
    zone: "critical",
    label: "Compounding exposure",
    color: "#b91c1c",
    bgColor: "#fef2f2",
    borderColor: "#fecaca",
    description: `${delayDays - 45} days past the window. Deduction disallowed plus ${((delayDays - 45) / 365 * 18).toFixed(1)}% interest accruing.`,
  };
}

function RiskMeter({ percentage }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <div className="relative h-2 w-full rounded-full bg-zinc-100 overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{
          width: `${Math.min(100, percentage)}%`,
          backgroundColor:
            percentage < 20 ? "#059669" :
            percentage < 50 ? "#d97706" :
            "#dc2626",
        }}
        transition={
          shouldReduceMotion
            ? { duration: 0.2 }
            : { type: "spring", stiffness: 220, damping: 26 }
        }
      />
      {/* Threshold markers */}
      <div className="absolute top-0 left-[15%] w-px h-full bg-zinc-300" title="15 days" />
      <div className="absolute top-0 left-[45%] w-px h-full bg-red-300" title="45 days - 43B(h)" />
    </div>
  );
}

export default function TaxSimulator({ stats }) {
  const [delay, setDelay] = useState(12);
  const portfolioValue = stats?.total_value || 1_200_000;
  const shouldReduceMotion = useReducedMotion();

  const result = useMemo(() => calculateRisk(delay, portfolioValue), [delay, portfolioValue]);
  const riskPercentage = Math.min(100, (result.risk / portfolioValue) * 100);

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, y: 16 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 24, delay: 0.16 }}
      className="glass rounded-xl overflow-hidden h-full flex flex-col will-change-transform"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Gauge size={13} className="text-zinc-500" />
            <h3 className="text-[13px] text-zinc-900 font-semibold tracking-tight">
              43B(h) cliff estimator
            </h3>
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5 ml-[21px]">
            One use case: drag to model payment delay
          </p>
        </div>
        <AnimatePresence mode="wait">
          <motion.span
            key={result.zone}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="text-[9px] font-bold uppercase tracking-wider px-2 py-1 rounded-md border"
            style={{
              color: result.color,
              background: result.bgColor,
              borderColor: result.borderColor,
            }}
          >
            {result.label}
          </motion.span>
        </AnimatePresence>
      </div>

      <div className="p-4 space-y-5 flex-1">
        {/* Big Risk Number */}
        <div className="text-center py-2">
          <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">
            Estimated tax exposure
          </p>
          <motion.div
            key={result.risk}
            initial={{ scale: 1.05, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <span
              className="text-[34px] font-bold tabular-nums leading-none tracking-tight"
              style={{ color: result.color }}
            >
              INR {result.risk.toLocaleString("en-IN")}
            </span>
          </motion.div>
          <p className="text-[11px] text-zinc-500 mt-1.5 tabular-nums">
            {riskPercentage.toFixed(1)}% of INR {portfolioValue.toLocaleString("en-IN")} payables
          </p>
        </div>

        {/* Risk Meter */}
        <RiskMeter percentage={(delay / 100) * 100} />

        {/* Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-zinc-600 font-medium flex items-center gap-1.5">
              <TrendingUp size={11} className="text-zinc-500" />
              Average payment delay
            </label>
            <span className="text-[13px] text-zinc-900 font-semibold tabular-nums tracking-tight">
              {delay} days
            </span>
          </div>

          <div className="relative">
            <input
              type="range"
              min={0}
              max={100}
              value={delay}
              onChange={(e) => setDelay(Number(e.target.value))}
              className="w-full h-2 appearance-none rounded-full cursor-pointer slider-input"
              style={{
                background: `linear-gradient(to right, #059669 0%, #059669 15%, #d97706 15%, #d97706 44%, #dc2626 44%, #dc2626 100%)`,
              }}
            />
            {/* Tick marks */}
            <div className="flex justify-between mt-1.5 px-0.5">
              <span className="text-[8px] text-zinc-400">0d</span>
              <span className="text-[8px] text-emerald-700">15d</span>
              <span className="text-[8px] text-amber-700">30d</span>
              <span className="text-[8px] text-red-700 font-bold">45d</span>
              <span className="text-[8px] text-zinc-400">60d</span>
              <span className="text-[8px] text-zinc-400">80d</span>
              <span className="text-[8px] text-zinc-400">100d</span>
            </div>
          </div>
        </div>

        {/* Context message */}
        <motion.div
          key={result.description}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="rounded-lg px-3 py-2.5 text-[11px] leading-relaxed border"
          style={{
            background: result.bgColor,
            borderColor: result.borderColor,
            color: result.color,
          }}
        >
          {result.description}
        </motion.div>

        {/* 45-day cliff callout */}
        <AnimatePresence>
          {delay >= 43 && delay <= 47 && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              transition={shouldReduceMotion ? { duration: 0.15 } : { type: "spring", stiffness: 240, damping: 26 }}
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 will-change-transform"
            >
              <p className="text-[11px] text-red-700 font-semibold flex items-center gap-1.5">
                <AlertTriangle size={12} />
                The 43B(h) cliff
              </p>
              <p className="text-[10px] text-red-700 mt-0.5">
                At day 45 the window closes. INR {Math.round(portfolioValue * 0.30).toLocaleString("en-IN")} in deductions drop off as a single binary event, not a gradient.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

import { useState, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Gauge, TrendingUp, AlertTriangle, ShieldCheck } from "lucide-react";

/**
 * 43B(h) Tax Risk Model:
 * - MSME payments within 15 days (no agreement) or 45 days (with agreement): fully deductible
 * - Beyond the deadline: ENTIRE amount becomes non-deductible -> 30% corporate tax hit
 * - The "cliff" at 45 days is the demo killer moment for George
 */
function calculateRisk(delayDays, portfolioValue) {
  const portfolio = portfolioValue || 1_200_000;

  if (delayDays <= 15) {
    return {
      risk: Math.round(portfolio * (delayDays / 100) * 0.02),
      zone: "safe",
      label: "Compliant",
      color: "#10b981",
      bgColor: "rgba(16, 185, 129, 0.06)",
      borderColor: "rgba(16, 185, 129, 0.15)",
      description: "All payments within 43B(h) window. Full deductions preserved.",
    };
  }

  if (delayDays <= 44) {
    const progress = (delayDays - 15) / 30;
    return {
      risk: Math.round(portfolio * progress * 0.08),
      zone: "warning",
      label: "Approaching Risk",
      color: "#f59e0b",
      bgColor: "rgba(245, 158, 11, 0.06)",
      borderColor: "rgba(245, 158, 11, 0.15)",
      description: `${45 - delayDays} days until 43B(h) deadline. Expedite payments now.`,
    };
  }

  if (delayDays <= 45) {
    return {
      risk: Math.round(portfolio * 0.30),
      zone: "critical",
      label: "DEDUCTION DISALLOWED",
      color: "#f43f5e",
      bgColor: "rgba(244, 63, 94, 0.06)",
      borderColor: "rgba(244, 63, 94, 0.15)",
      description: "43B(h) triggered. Entire MSME payable now non-deductible. 30% tax hit.",
    };
  }

  const baseRisk = portfolio * 0.30;
  const escalation = 1 + ((delayDays - 45) / 55) * 0.8;
  const interestPenalty = portfolio * ((delayDays - 45) / 365) * 0.18;

  return {
    risk: Math.round(baseRisk * escalation + interestPenalty),
    zone: "critical",
    label: "SEVERE EXPOSURE",
    color: "#f43f5e",
    bgColor: "rgba(244, 63, 94, 0.08)",
    borderColor: "rgba(244, 63, 94, 0.2)",
    description: `${delayDays - 45} days overdue. Tax disallowance + ${((delayDays - 45) / 365 * 18).toFixed(1)}% interest accruing.`,
  };
}

function RiskMeter({ percentage }) {
  const shouldReduceMotion = useReducedMotion();
  return (
    <div className="relative h-2 w-full rounded-full bg-white/[0.04] overflow-hidden">
      <motion.div
        className="h-full rounded-full"
        initial={{ width: 0 }}
        animate={{
          width: `${Math.min(100, percentage)}%`,
          backgroundColor:
            percentage < 20 ? "#10b981" :
            percentage < 50 ? "#f59e0b" :
            "#f43f5e",
        }}
        transition={
          shouldReduceMotion
            ? { duration: 0.2 }
            : { type: "spring", stiffness: 220, damping: 26 }
        }
      />
      {/* Threshold markers */}
      <div className="absolute top-0 left-[15%] w-px h-full bg-white/[0.08]" title="15 days" />
      <div className="absolute top-0 left-[45%] w-px h-full bg-rose-500/30" title="45 days - 43B(h)" />
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
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Gauge size={13} className="text-slate-400" />
            <h3 className="text-[13px] text-white font-semibold tracking-tight">
              Tax Savings Simulator
            </h3>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 ml-[21px]">
            43B(h) risk model -- drag to simulate
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
          <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">
            Potential Tax Risk
          </p>
          <motion.div
            key={result.risk}
            initial={{ scale: 1.05, opacity: 0.7 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 400, damping: 25 }}
          >
            <span
              className={`text-[34px] font-bold tabular-nums leading-none tracking-tight ${
                result.zone === "safe" ? "glow-emerald" :
                result.zone === "critical" ? "glow-rose" : ""
              }`}
              style={{ color: result.color }}
            >
              INR {result.risk.toLocaleString("en-IN")}
            </span>
          </motion.div>
          <p className="text-[11px] text-slate-600 mt-1.5 tabular-nums">
            {riskPercentage.toFixed(1)}% of INR {portfolioValue.toLocaleString("en-IN")} portfolio
          </p>
        </div>

        {/* Risk Meter */}
        <RiskMeter percentage={(delay / 100) * 100} />

        {/* Slider */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[11px] text-slate-400 font-medium flex items-center gap-1.5">
              <TrendingUp size={11} className="text-slate-500" />
              Average Payment Delay
            </label>
            <span className="text-[13px] text-white font-semibold tabular-nums tracking-tight">
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
                background: `linear-gradient(to right, #10b981 0%, #10b981 15%, #f59e0b 15%, #f59e0b 44%, #f43f5e 44%, #f43f5e 100%)`,
              }}
            />
            {/* Tick marks */}
            <div className="flex justify-between mt-1.5 px-0.5">
              <span className="text-[8px] text-slate-700">0d</span>
              <span className="text-[8px] text-emerald-500/70">15d</span>
              <span className="text-[8px] text-amber-500/70">30d</span>
              <span className="text-[8px] text-rose-500/70 font-bold">45d</span>
              <span className="text-[8px] text-slate-700">60d</span>
              <span className="text-[8px] text-slate-700">80d</span>
              <span className="text-[8px] text-slate-700">100d</span>
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
              className="rounded-lg border border-rose-500/20 bg-rose-500/5 px-3 py-2 will-change-transform"
            >
              <p className="text-[11px] text-rose-400 font-semibold flex items-center gap-1.5">
                <AlertTriangle size={12} />
                The 43B(h) Cliff
              </p>
              <p className="text-[10px] text-rose-400/60 mt-0.5">
                At exactly 45 days, INR {Math.round(portfolioValue * 0.30).toLocaleString("en-IN")} in deductions are instantly disallowed.
                This is a binary event -- there is no partial compliance.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

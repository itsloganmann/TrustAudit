import { motion } from "framer-motion";

/**
 * Hero product illustration — restrained light-theme replacement for the
 * previous 3D/SVG shield. A clean white card showing three sample invoice
 * rows with status pills (clear / missing proof / disputed). No WebGL,
 * no heavy motion, just a fade-in.
 *
 * The component is kept as a default export so the lazy() import in
 * Landing.jsx continues to resolve.
 */

const ROWS = [
  {
    vendor: "Kiran Pharma Dist.",
    amount: "₹4,50,000",
    window: "3d",
    statusLabel: "Clear to claim",
    statusClass: "bg-emerald-50 text-emerald-700 border-emerald-200",
    dot: "bg-emerald-500",
  },
  {
    vendor: "Shakti Industrial",
    amount: "₹2,85,000",
    window: "7d",
    statusLabel: "Missing proof",
    statusClass: "bg-amber-50 text-amber-700 border-amber-200",
    dot: "bg-amber-500",
  },
  {
    vendor: "Bharat Process Mfg.",
    amount: "₹11,20,000",
    window: "12d",
    statusLabel: "Disputed",
    statusClass: "bg-red-50 text-red-700 border-red-200",
    dot: "bg-red-500",
  },
];

export default function ShieldHero3D() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full max-w-[520px] mx-auto"
    >
      <div className="relative rounded-2xl bg-white border border-zinc-200 shadow-sm overflow-hidden min-h-[480px] flex flex-col">
        {/* Card header */}
        <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
          <div>
            <p className="text-[11px] text-zinc-500 uppercase tracking-widest font-semibold">
              AP decision queue
            </p>
            <p className="mt-1 text-[14px] text-zinc-900 font-semibold tracking-tight">
              Today's verdicts
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 px-2.5 h-6 rounded-md bg-emerald-50 border border-emerald-200 text-[11px] font-medium text-emerald-700">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Live
          </span>
        </div>

        {/* Column labels */}
        <div className="px-5 pt-4 pb-2 grid grid-cols-12 gap-3 text-[10px] uppercase tracking-widest text-zinc-500 font-semibold">
          <div className="col-span-6">Vendor</div>
          <div className="col-span-3 text-right">Amount</div>
          <div className="col-span-3 text-right">Window</div>
        </div>

        {/* Rows */}
        <div className="px-5 pb-4 space-y-2">
          {ROWS.map((row, i) => (
            <motion.div
              key={row.vendor}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: 0.35,
                delay: 0.1 + i * 0.08,
                ease: [0.22, 1, 0.36, 1],
              }}
              className="group rounded-lg border border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50 transition-colors px-3.5 py-3"
            >
              <div className="grid grid-cols-12 gap-3 items-center">
                <div className="col-span-6 flex items-center gap-2.5 min-w-0">
                  <span
                    className={`w-1.5 h-8 rounded-full shrink-0 ${row.dot}`}
                    aria-hidden
                  />
                  <span className="text-[13px] text-zinc-900 font-medium tracking-tight truncate">
                    {row.vendor}
                  </span>
                </div>
                <div className="col-span-3 text-right">
                  <span className="text-[13px] text-zinc-900 font-semibold tabular-nums tracking-tight">
                    {row.amount}
                  </span>
                </div>
                <div className="col-span-3 text-right">
                  <span className="text-[12px] text-zinc-600 font-mono tabular-nums">
                    {row.window}
                  </span>
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span
                  className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[11px] font-medium ${row.statusClass}`}
                >
                  {row.statusLabel}
                </span>
                <span className="text-[11px] text-zinc-500 tabular-nums">
                  Invoice #{1024 + i}
                </span>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Footer strip */}
        <div className="mt-auto px-5 py-3 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between">
          <span className="text-[11px] text-zinc-600">
            3 verdicts in the last hour
          </span>
          <span className="text-[11px] text-emerald-700 font-medium">
            97.4% match rate
          </span>
        </div>
      </div>
    </motion.div>
  );
}

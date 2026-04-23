import { useMemo } from "react";
// eslint-disable-next-line no-unused-vars
import { motion, useReducedMotion } from "framer-motion";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { BarChart3 } from "lucide-react";

/**
 * Generate 30 days of synthetic compliance data.
 * In production this would come from `/api/chart-data`.
 * For the demo, we derive it deterministically from `stats`
 * so the chart responds to live simulation changes.
 */
function generateChartData(stats) {
  const today = new Date();
  const totalLiability = stats.total_value || 1_200_000;
  const saved = stats.liability_saved || 420_000;
  const data = [];

  for (let i = 29; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const label = d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });

    const progress = (30 - i) / 30;
    const noise = Math.sin(i * 0.7) * 0.15 + 1;
    const dayLiability = Math.round(
      (totalLiability / 30) * noise * (0.6 + progress * 0.4)
    );
    const daySaved = Math.round(
      (saved / 30) * noise * Math.min(1, progress * 1.3) * (i < 5 ? 1.4 : 1)
    );

    data.push({
      date: label,
      liability: dayLiability,
      saved: daySaved,
      atRisk: Math.max(0, dayLiability - daySaved),
    });
  }

  return data;
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;

  const saved = payload.find((p) => p.dataKey === "saved");
  const atRisk = payload.find((p) => p.dataKey === "atRisk");

  return (
    <div className="rounded-lg px-3.5 py-2.5 bg-white border border-zinc-200 shadow-sm">
      <p className="text-[11px] text-zinc-500 font-medium mb-1.5">{label}</p>
      <div className="space-y-1">
        {saved && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-emerald-600" />
            <span className="text-[12px] text-zinc-600">Cleared</span>
            <span className="text-[12px] text-emerald-700 font-semibold ml-auto tabular-nums">
              INR {saved.value.toLocaleString("en-IN")}
            </span>
          </div>
        )}
        {atRisk && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-red-600" />
            <span className="text-[12px] text-zinc-600">Unresolved</span>
            <span className="text-[12px] text-red-700 font-semibold ml-auto tabular-nums">
              INR {atRisk.value.toLocaleString("en-IN")}
            </span>
          </div>
        )}
        <div className="border-t border-zinc-200 pt-1 mt-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-zinc-500">Total</span>
            <span className="text-[12px] text-zinc-900 font-semibold ml-auto tabular-nums">
              INR {((saved?.value || 0) + (atRisk?.value || 0)).toLocaleString("en-IN")}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ComplianceChart({ stats }) {
  const data = useMemo(() => generateChartData(stats), [stats]);
  const shouldReduceMotion = useReducedMotion();

  const totals = useMemo(() => {
    const totalSaved = data.reduce((s, d) => s + d.saved, 0);
    const totalLiability = data.reduce((s, d) => s + d.liability, 0);
    return {
      totalSaved,
      totalLiability,
      rate: totalLiability > 0 ? Math.round((totalSaved / totalLiability) * 100) : 0,
    };
  }, [data]);

  return (
    <motion.div
      initial={shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.985 }}
      animate={shouldReduceMotion ? { opacity: 1 } : { opacity: 1, scale: 1 }}
      transition={{ type: "spring", stiffness: 200, damping: 24, delay: 0.1 }}
      className="glass rounded-xl overflow-hidden h-full flex flex-col will-change-transform"
    >
      {/* Header */}
      <div className="px-4 py-3 border-b border-zinc-200 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={13} className="text-zinc-500" />
            <h3 className="text-[13px] text-zinc-900 font-semibold tracking-tight">
              Live invoice acceptance
            </h3>
            <span className="text-[10px] text-zinc-500 font-medium">30-day window</span>
          </div>
          <p className="text-[10px] text-zinc-500 mt-0.5 ml-[21px]">
            Cleared to claim vs unresolved payables
          </p>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-600" />
            <span className="text-[11px] text-zinc-600">Cleared</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-red-600" />
            <span className="text-[11px] text-zinc-600">Unresolved</span>
          </div>
          <div className="text-right ml-3">
            <span className="text-[18px] font-bold text-emerald-700 tabular-nums tracking-tight">
              {totals.rate}%
            </span>
            <p className="text-[9px] text-zinc-500 uppercase tracking-wider">cleared</p>
          </div>
        </div>
      </div>

      {/* Chart — AreaChart with gradient fills */}
      <div className="px-2 py-3 flex-1 bg-white">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart
            data={data}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gradSaved" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#059669" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#059669" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradRisk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#dc2626" stopOpacity={0.25} />
                <stop offset="100%" stopColor="#dc2626" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="#e4e4e7"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "#a1a1aa" }}
              axisLine={{ stroke: "#e4e4e7" }}
              tickLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#a1a1aa" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${(v / 1000).toFixed(0)}K`
              }
              width={48}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "#e4e4e7", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="saved"
              stackId="1"
              stroke="#059669"
              strokeWidth={1.5}
              fill="url(#gradSaved)"
            />
            <Area
              type="monotone"
              dataKey="atRisk"
              stackId="1"
              stroke="#dc2626"
              strokeWidth={1.5}
              fill="url(#gradRisk)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}

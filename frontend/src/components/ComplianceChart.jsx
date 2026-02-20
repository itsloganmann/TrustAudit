import { useMemo } from "react";
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
    <div className="glass rounded-lg px-3.5 py-2.5 shadow-xl shadow-black/40 border border-white/[0.08]">
      <p className="text-[11px] text-slate-500 font-medium mb-1.5">{label}</p>
      <div className="space-y-1">
        {saved && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-emerald-500" />
            <span className="text-[12px] text-slate-400">Saved</span>
            <span className="text-[12px] text-emerald-400 font-semibold ml-auto tabular-nums">
              INR {saved.value.toLocaleString("en-IN")}
            </span>
          </div>
        )}
        {atRisk && (
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-sm bg-rose-500" />
            <span className="text-[12px] text-slate-400">At Risk</span>
            <span className="text-[12px] text-rose-400 font-semibold ml-auto tabular-nums">
              INR {atRisk.value.toLocaleString("en-IN")}
            </span>
          </div>
        )}
        <div className="border-t border-white/[0.06] pt-1 mt-1">
          <div className="flex items-center gap-2">
            <span className="text-[12px] text-slate-500">Total</span>
            <span className="text-[12px] text-white font-semibold ml-auto tabular-nums">
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
    <div className="glass rounded-xl overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BarChart3 size={13} className="text-slate-400" />
            <h3 className="text-[13px] text-white font-semibold tracking-tight">
              Risk Exposure
            </h3>
            <span className="text-[10px] text-slate-600 font-medium">30-day window</span>
          </div>
          <p className="text-[10px] text-slate-500 mt-0.5 ml-[21px]">
            43B(h) deduction recovery vs total liability
          </p>
        </div>
        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
            <span className="text-[11px] text-slate-500">Saved</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm bg-rose-500" />
            <span className="text-[11px] text-slate-500">At Risk</span>
          </div>
          <div className="text-right ml-3">
            <span className="text-[18px] font-bold text-emerald-400 tabular-nums tracking-tight glow-emerald">
              {totals.rate}%
            </span>
            <p className="text-[9px] text-slate-600 uppercase tracking-wider">recovered</p>
          </div>
        </div>
      </div>

      {/* Chart — AreaChart with gradient fills */}
      <div className="px-2 py-3 flex-1">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart
            data={data}
            margin={{ top: 4, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="gradSaved" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#10b981" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="gradRisk" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#f43f5e" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#f43f5e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="rgba(255,255,255,0.04)"
              vertical={false}
            />
            <XAxis
              dataKey="date"
              tick={{ fontSize: 9, fill: "#475569" }}
              axisLine={{ stroke: "rgba(255,255,255,0.06)" }}
              tickLine={false}
              interval={4}
            />
            <YAxis
              tick={{ fontSize: 9, fill: "#475569" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) =>
                v >= 100000 ? `${(v / 100000).toFixed(1)}L` : `${(v / 1000).toFixed(0)}K`
              }
              width={48}
            />
            <Tooltip
              content={<CustomTooltip />}
              cursor={{ stroke: "rgba(255,255,255,0.06)", strokeWidth: 1 }}
            />
            <Area
              type="monotone"
              dataKey="saved"
              stackId="1"
              stroke="#10b981"
              strokeWidth={1.5}
              fill="url(#gradSaved)"
            />
            <Area
              type="monotone"
              dataKey="atRisk"
              stackId="1"
              stroke="#f43f5e"
              strokeWidth={1.5}
              fill="url(#gradRisk)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

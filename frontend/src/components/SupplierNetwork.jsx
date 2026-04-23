import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2,
  Factory,
  Package,
  PackageCheck,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

/* ═══════════════════════════════════════════════════════
   Synthetic Data — deterministic demo data for 10 MSMEs
   ═══════════════════════════════════════════════════════ */

const SUPPLIER = {
  name: "Tata Steel Ltd.",
  gstin: "27AABCT1332L1ZH",
  sector: "Metal & Steel Manufacturing",
};

const MSME_NAMES = [
  { name: "Bharat Forge Works", city: "Pune" },
  { name: "Rajesh Metalcraft", city: "Ahmedabad" },
  { name: "Chennai Precision Tools", city: "Chennai" },
  { name: "Sai Engineering", city: "Hyderabad" },
  { name: "Gujarat Steel Fabricators", city: "Surat" },
  { name: "Ambika Manufacturing", city: "Mumbai" },
  { name: "Indo-Asian Forgings", city: "Ludhiana" },
  { name: "Kaveri Enterprises", city: "Bangalore" },
  { name: "Northern Alloys", city: "Jaipur" },
  { name: "Pacific Metal Works", city: "Kolkata" },
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function seededRng(seed) {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateMsmeData() {
  return MSME_NAMES.map((msme, idx) => {
    const rng = seededRng((idx + 1) * 7919);
    const months = MONTHS.map((m) => {
      const delivered = Math.floor(rng() * 40) + 10;
      const received = Math.max(0, delivered - Math.floor(rng() * 8));
      const conflict = Math.floor(rng() * 6);
      return { month: m, delivered, received, conflict };
    });

    const totalDelivered = months.reduce((s, m) => s + m.delivered, 0);
    const totalReceived = months.reduce((s, m) => s + m.received, 0);
    const totalConflict = months.reduce((s, m) => s + m.conflict, 0);
    const healthScore = Math.round(
      ((totalReceived - totalConflict) / totalDelivered) * 100
    );

    return {
      id: idx,
      ...msme,
      months,
      totalDelivered,
      totalReceived,
      totalConflict,
      healthScore: Math.min(100, Math.max(0, healthScore)),
    };
  });
}

/* ═══════════════════════════════════════════════════════
   Chart Tooltip
   ═══════════════════════════════════════════════════════ */

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg px-3 py-2 bg-white border border-zinc-200 shadow-sm">
      <p className="text-[10px] text-zinc-500 font-medium mb-1">{label} 2025</p>
      {payload.map((p) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-[11px]">
          <span className="w-2 h-2 rounded-sm" style={{ background: p.color }} />
          <span className="text-zinc-600 capitalize">{p.dataKey}</span>
          <span className="ml-auto font-semibold tabular-nums" style={{ color: p.color }}>
            {p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Helpers
   ═══════════════════════════════════════════════════════ */

function healthColor(score) {
  if (score >= 85) return "#059669";
  if (score >= 65) return "#d97706";
  return "#dc2626";
}

function healthLabel(score) {
  if (score >= 85) return "Healthy";
  if (score >= 65) return "Watch";
  return "Disputed";
}

/* ═══════════════════════════════════════════════════════
   SVG Network Graph — animated hub-and-spoke layout
   ═══════════════════════════════════════════════════════ */

function NetworkGraph({ msmes, selectedId, onSelect, hoveredId, onHover }) {
  const cx = 260;
  const cy = 200;
  const radius = 155;

  const nodes = msmes.map((m, i) => {
    const angle = (i / msmes.length) * Math.PI * 2 - Math.PI / 2;
    return {
      ...m,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius,
    };
  });

  return (
    <svg viewBox="0 0 520 400" className="w-full h-auto" style={{ maxHeight: 420 }}>
      <defs>
        <radialGradient id="supplierGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#059669" stopOpacity="0.15" />
          <stop offset="100%" stopColor="#059669" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="nodeHoverGlow" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#059669" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#059669" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Connection lines */}
      {nodes.map((n, i) => {
        const isActive = selectedId === n.id;
        const isHovered = hoveredId === n.id;
        return (
          <g key={`line-${i}`}>
            <line
              x1={cx} y1={cy} x2={n.x} y2={n.y}
              stroke={isActive ? healthColor(n.healthScore) : "#d4d4d8"}
              strokeWidth={isActive ? 2 : isHovered ? 1.5 : 1}
              strokeOpacity={isActive ? 0.7 : isHovered ? 0.5 : 0.35}
              className="transition-all duration-300"
            />
            {/* Data-flow particle */}
            <circle r={isActive ? 3 : 2} fill={healthColor(n.healthScore)} opacity={isActive ? 0.9 : 0.5}>
              <animateMotion dur={`${2 + i * 0.3}s`} repeatCount="indefinite" path={`M${cx},${cy} L${n.x},${n.y}`} />
            </circle>
            {/* Reverse particle for active */}
            {isActive && (
              <circle r="2" fill="#059669" opacity="0.6">
                <animateMotion dur={`${2.5 + i * 0.2}s`} repeatCount="indefinite" path={`M${n.x},${n.y} L${cx},${cy}`} />
              </circle>
            )}
          </g>
        );
      })}

      {/* Supplier hub outer ring */}
      <circle cx={cx} cy={cy} r="38" fill="none" stroke="#d4d4d8" strokeWidth="1" strokeDasharray="4 4">
        <animateTransform attributeName="transform" type="rotate" from={`0 ${cx} ${cy}`} to={`360 ${cx} ${cy}`} dur="30s" repeatCount="indefinite" />
      </circle>

      {/* Supplier hub glow */}
      <circle cx={cx} cy={cy} r="55" fill="url(#supplierGlow)" />

      {/* Supplier hub */}
      <circle cx={cx} cy={cy} r="28" fill="#ffffff" stroke="#059669" strokeWidth="1.5" />
      <foreignObject x={cx - 8} y={cy - 8} width="16" height="16">
        <Factory size={16} style={{ color: "#059669" }} />
      </foreignObject>
      <text x={cx} y={cy + 43} textAnchor="middle" fill="#09090b" fontSize="10" fontWeight="600">
        {SUPPLIER.name}
      </text>
      <text x={cx} y={cy + 55} textAnchor="middle" fill="#71717a" fontSize="8">
        {SUPPLIER.sector}
      </text>

      {/* MSME nodes */}
      {nodes.map((n) => {
        const isSelected = selectedId === n.id;
        const isHovered = hoveredId === n.id;
        const hc = healthColor(n.healthScore);

        return (
          <g
            key={n.id}
            onClick={() => onSelect(n.id)}
            onMouseEnter={() => onHover(n.id)}
            onMouseLeave={() => onHover(null)}
            className="cursor-pointer"
            role="button"
            tabIndex={0}
          >
            {/* Hover glow ring */}
            {(isHovered || isSelected) && (
              <circle cx={n.x} cy={n.y} r="28" fill="url(#nodeHoverGlow)" />
            )}

            {/* Selection pulse ring */}
            {isSelected && (
              <circle cx={n.x} cy={n.y} r="24" fill="none" stroke="#059669" strokeWidth="1.5" strokeOpacity="0.4" className="network-pulse" />
            )}

            {/* Node circle */}
            <circle
              cx={n.x} cy={n.y} r="18"
              fill={isSelected ? "#ecfdf5" : isHovered ? "#fafafa" : "#ffffff"}
              stroke={isSelected ? "#059669" : isHovered ? "#d4d4d8" : "#e4e4e7"}
              strokeWidth={isSelected ? 1.5 : 1}
              className="transition-all duration-200"
            />

            {/* Health indicator dot */}
            <circle cx={n.x + 13} cy={n.y - 13} r="4" fill={hc} />

            {/* Icon */}
            <foreignObject x={n.x - 6} y={n.y - 6} width="12" height="12">
              <Building2 size={12} style={{ color: isSelected ? "#059669" : isHovered ? "#52525b" : "#71717a" }} />
            </foreignObject>

            {/* Name + city label */}
            <text x={n.x} y={n.y + 28} textAnchor="middle" fill={isSelected ? "#09090b" : isHovered ? "#3f3f46" : "#52525b"} fontSize="8" fontWeight={isSelected ? "600" : "400"}>
              {n.name.length > 18 ? n.name.slice(0, 16) + "…" : n.name}
            </text>
            <text x={n.x} y={n.y + 38} textAnchor="middle" fill="#a1a1aa" fontSize="7">
              {n.city}
            </text>

            {/* Hover tooltip: health score */}
            {isHovered && !isSelected && (
              <g>
                <rect x={n.x - 28} y={n.y - 38} width="56" height="18" rx="6" fill="#ffffff" stroke={hc} strokeWidth="0.5" opacity="0.98" />
                <text x={n.x} y={n.y - 25.5} textAnchor="middle" fill={hc} fontSize="8" fontWeight="600">
                  {healthLabel(n.healthScore)} {n.healthScore}%
                </text>
              </g>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/* ═══════════════════════════════════════════════════════
   Monthly Data Table — animated rows with micro‑bars
   ═══════════════════════════════════════════════════════ */

function MonthlyTable({ msme }) {
  const maxD = Math.max(...msme.months.map((m) => m.delivered));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[480px]">
        <thead>
          <tr className="border-b border-zinc-200 text-[10px] text-zinc-500 uppercase tracking-widest">
            <th className="text-left px-3 py-2 font-semibold">Month</th>
            <th className="text-right px-3 py-2 font-semibold">Delivered</th>
            <th className="text-right px-3 py-2 font-semibold">Accepted</th>
            <th className="text-right px-3 py-2 font-semibold">Disputed</th>
            <th className="px-3 py-2 font-semibold text-right">Match %</th>
          </tr>
        </thead>
        <tbody>
          {msme.months.map((m, i) => {
            const matchRate = m.delivered > 0 ? Math.round(((m.received - m.conflict) / m.delivered) * 100) : 0;
            return (
              <motion.tr
                key={m.month}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04, type: "spring", stiffness: 500, damping: 40 }}
                className="border-b border-zinc-100 hover:bg-zinc-50 transition-colors group"
              >
                <td className="px-3 py-2.5">
                  <span className="text-[12px] text-zinc-700 font-medium group-hover:text-zinc-900 transition-colors">
                    {m.month} 2025
                  </span>
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center gap-2 justify-end">
                    <div className="w-16 h-1.5 rounded-full bg-zinc-100 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-emerald-600"
                        initial={{ width: 0 }}
                        animate={{ width: `${(m.delivered / maxD) * 100}%` }}
                        transition={{ delay: i * 0.05, duration: 0.6, ease: "easeOut" }}
                      />
                    </div>
                    <span className="text-[12px] text-emerald-700 font-semibold tabular-nums w-6 text-right">
                      {m.delivered}
                    </span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className="text-[12px] text-emerald-700 font-semibold tabular-nums">
                    {m.received}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <span className={`text-[12px] font-semibold tabular-nums ${m.conflict > 3 ? "text-red-700" : m.conflict > 0 ? "text-amber-700" : "text-zinc-500"}`}>
                    {m.conflict}
                  </span>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <div className="flex items-center gap-1 justify-end">
                    {matchRate >= 85 ? (
                      <ArrowUpRight size={10} className="text-emerald-700" />
                    ) : matchRate < 65 ? (
                      <ArrowDownRight size={10} className="text-red-700" />
                    ) : null}
                    <span className={`text-[11px] font-bold tabular-nums ${matchRate >= 85 ? "text-emerald-700" : matchRate >= 65 ? "text-amber-700" : "text-red-700"}`}>
                      {matchRate}%
                    </span>
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-zinc-200 bg-zinc-50">
            <td className="px-3 py-2.5">
              <span className="text-[11px] text-zinc-600 font-semibold uppercase tracking-wider">Total</span>
            </td>
            <td className="px-3 py-2.5 text-right">
              <span className="text-[13px] text-emerald-700 font-bold tabular-nums">{msme.totalDelivered}</span>
            </td>
            <td className="px-3 py-2.5 text-right">
              <span className="text-[13px] text-emerald-700 font-bold tabular-nums">{msme.totalReceived}</span>
            </td>
            <td className="px-3 py-2.5 text-right">
              <span className="text-[13px] text-red-700 font-bold tabular-nums">{msme.totalConflict}</span>
            </td>
            <td className="px-3 py-2.5 text-right">
              <span className={`text-[12px] font-bold tabular-nums ${msme.healthScore >= 85 ? "text-emerald-700" : msme.healthScore >= 65 ? "text-amber-700" : "text-red-700"}`}>
                {msme.healthScore}%
              </span>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Mini Stat Card
   ═══════════════════════════════════════════════════════ */

function MiniStat({ icon: Icon, label, value, color }) {
  return (
    <div className="text-right">
      <div className="flex items-center gap-1 justify-end">
        <Icon size={10} style={{ color }} className="opacity-70" />
        <p className="text-[9px] text-zinc-500 uppercase tracking-wider">{label}</p>
      </div>
      <motion.p
        key={value}
        initial={{ scale: 1.1, opacity: 0.6 }}
        animate={{ scale: 1, opacity: 1 }}
        className="text-[15px] font-bold tabular-nums leading-tight"
        style={{ color }}
      >
        {value}
      </motion.p>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════
   Main Export — Supplier Network Dashboard
   ═══════════════════════════════════════════════════════ */

export default function SupplierNetwork() {
  const msmes = useMemo(() => generateMsmeData(), []);
  const [selectedId, setSelectedId] = useState(0);
  const [hoveredId, setHoveredId] = useState(null);
  const selected = msmes.find((m) => m.id === selectedId) || msmes[0];

  const chartData = useMemo(
    () => selected.months.map((m) => ({ month: m.month, delivered: m.delivered, received: m.received, conflict: m.conflict })),
    [selected]
  );

  const handleSelect = useCallback((id) => setSelectedId(id), []);
  const handleHover = useCallback((id) => setHoveredId(id), []);

  return (
    <div className="glass rounded-xl overflow-hidden">
      {/* Section header */}
      <div className="px-5 py-4 border-b border-zinc-200 flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center">
              <Factory size={12} className="text-emerald-700" />
            </div>
            <h2 className="text-[14px] text-zinc-900 font-semibold tracking-tight">
              Supplier network
            </h2>
            <span className="text-[10px] text-zinc-500 font-medium bg-zinc-50 border border-zinc-200 rounded-md px-1.5 py-0.5">
              FY 2025
            </span>
          </div>
          <p className="text-[11px] text-zinc-500 mt-0.5 ml-8">
            Invoice flow between {SUPPLIER.name} and 10 registered MSME suppliers
          </p>
        </div>
        <div className="flex items-center gap-4 text-[10px]">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-emerald-600" />
            <span className="text-zinc-600">Delivered</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-emerald-500" />
            <span className="text-zinc-600">Accepted</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-sm bg-red-600" />
            <span className="text-zinc-600">Disputed</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
        {/* LEFT: Network Graph */}
        <div className="lg:col-span-2 p-4 border-b lg:border-b-0 lg:border-r border-zinc-200">
          <NetworkGraph
            msmes={msmes}
            selectedId={selectedId}
            onSelect={handleSelect}
            hoveredId={hoveredId}
            onHover={handleHover}
          />

          {/* MSME pill selector bar */}
          <div className="flex flex-wrap gap-1.5 mt-3">
            {msmes.map((m) => (
              <button
                key={m.id}
                onClick={() => handleSelect(m.id)}
                onMouseEnter={() => handleHover(m.id)}
                onMouseLeave={() => handleHover(null)}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-medium transition-all flex items-center gap-1.5 border ${
                  selectedId === m.id
                    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                    : "text-zinc-600 hover:text-zinc-900 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50 bg-white"
                }`}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: healthColor(m.healthScore) }} />
                {m.name.split(" ").slice(0, 2).join(" ")}
              </button>
            ))}
          </div>
        </div>

        {/* RIGHT: Detail panel for selected MSME */}
        <div className="lg:col-span-3 flex flex-col">
          <AnimatePresence mode="wait">
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex flex-col h-full"
            >
              {/* MSME header with stats */}
              <div className="px-5 py-3 border-b border-zinc-200 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                    className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center"
                  >
                    <Building2 size={15} className="text-emerald-700" />
                  </motion.div>
                  <div>
                    <h3 className="text-[13px] text-zinc-900 font-semibold tracking-tight">
                      {selected.name}
                    </h3>
                    <p className="text-[10px] text-zinc-500">{selected.city}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <MiniStat icon={Package} label="Delivered" value={selected.totalDelivered} color="#059669" />
                  <MiniStat icon={PackageCheck} label="Accepted" value={selected.totalReceived} color="#10b981" />
                  <MiniStat icon={AlertTriangle} label="Disputed" value={selected.totalConflict} color="#dc2626" />
                  <div className="text-right ml-2 pl-3 border-l border-zinc-200">
                    <p className="text-[9px] text-zinc-500 uppercase tracking-wider">Health</p>
                    <motion.p
                      key={selected.healthScore}
                      initial={{ scale: 1.2, opacity: 0.5 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ type: "spring", stiffness: 300, damping: 20 }}
                      className="text-[20px] font-bold tabular-nums leading-tight"
                      style={{ color: healthColor(selected.healthScore) }}
                    >
                      {selected.healthScore}
                      <span className="text-[11px] font-normal text-zinc-500">%</span>
                    </motion.p>
                  </div>
                </div>
              </div>

              {/* Bar chart */}
              <div className="px-4 pt-3 pb-1 bg-white">
                <ResponsiveContainer width="100%" height={140}>
                  <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barGap={1} barSize={12}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                    <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#a1a1aa" }} axisLine={{ stroke: "#e4e4e7" }} tickLine={false} />
                    <YAxis tick={{ fontSize: 9, fill: "#a1a1aa" }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: "#fafafa" }} />
                    <Bar dataKey="delivered" fill="#059669" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="received" fill="#10b981" radius={[2, 2, 0, 0]} />
                    <Bar dataKey="conflict" fill="#dc2626" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Monthly data table */}
              <div className="flex-1">
                <MonthlyTable msme={selected} />
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

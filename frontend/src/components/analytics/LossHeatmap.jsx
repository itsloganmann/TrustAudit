import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Map as MapIcon } from "lucide-react";

/**
 * @typedef {object} StateLoss
 * @property {string} state - State code (e.g. "MH", "KA") or full name
 * @property {number} loss - Loss exposure in INR
 * @property {number} [count] - Document count
 */

/* India states grid (rough geographic layout, 9 cols x 8 rows). */
const STATE_GRID = [
  // row 0
  ["JK", null, null, null, null, null, null, null, null],
  // row 1
  ["JK", "HP", "PB", "HR", "DL", "UK", null, null, null],
  // row 2
  [null, "RJ", "RJ", "DL", "UP", "UP", "BR", "AS", "AR"],
  // row 3
  ["GJ", "RJ", "MP", "MP", "UP", "JH", "WB", "NL", "MN"],
  // row 4
  ["GJ", "MH", "MH", "CG", "OD", "WB", "TR", "MZ", null],
  // row 5
  [null, "MH", "TS", "AP", "OD", null, null, null, null],
  // row 6
  [null, "GA", "KA", "AP", null, null, null, null, null],
  // row 7
  [null, null, "KL", "TN", "TN", null, null, null, null],
];

const STATE_NAMES = {
  JK: "Jammu & Kashmir",
  HP: "Himachal Pradesh",
  PB: "Punjab",
  HR: "Haryana",
  DL: "Delhi",
  UK: "Uttarakhand",
  RJ: "Rajasthan",
  UP: "Uttar Pradesh",
  BR: "Bihar",
  AS: "Assam",
  AR: "Arunachal Pradesh",
  GJ: "Gujarat",
  MP: "Madhya Pradesh",
  JH: "Jharkhand",
  WB: "West Bengal",
  NL: "Nagaland",
  MN: "Manipur",
  MH: "Maharashtra",
  CG: "Chhattisgarh",
  OD: "Odisha",
  TR: "Tripura",
  MZ: "Mizoram",
  TS: "Telangana",
  AP: "Andhra Pradesh",
  GA: "Goa",
  KA: "Karnataka",
  KL: "Kerala",
  TN: "Tamil Nadu",
};

function formatCrores(amount) {
  if (!amount) return "INR 0";
  if (amount >= 1e7) return `INR ${(amount / 1e7).toFixed(1)} Cr`;
  if (amount >= 1e5) return `INR ${(amount / 1e5).toFixed(1)} L`;
  return `INR ${Number(amount).toLocaleString("en-IN")}`;
}

/**
 * India state-level loss heatmap. Falls back to a grid layout (no external SVG).
 *
 * @param {object} props
 * @param {StateLoss[]} [props.data]
 * @param {string} [props.className]
 */
export default function LossHeatmap({ data = [], className = "" }) {
  const [hoverCell, setHoverCell] = useState(null);

  const lossByState = useMemo(() => {
    const map = {};
    for (const row of data) {
      const code = row.state;
      if (!code) continue;
      map[code] = (map[code] || 0) + (row.loss || 0);
    }
    return map;
  }, [data]);

  const maxLoss = useMemo(() => {
    const values = Object.values(lossByState);
    return values.length ? Math.max(...values, 1) : 1;
  }, [lossByState]);

  const totalLoss = useMemo(
    () => Object.values(lossByState).reduce((a, b) => a + b, 0),
    [lossByState]
  );

  function intensityColor(loss) {
    if (!loss) return "#fafafa";
    const t = Math.min(1, loss / maxLoss);
    // emerald (low) → amber → red (high)
    if (t < 0.33) {
      const a = 0.2 + t * 0.5;
      return `rgba(5, 150, 105, ${a})`;
    }
    if (t < 0.66) {
      const a = 0.25 + (t - 0.33) * 0.7;
      return `rgba(217, 119, 6, ${a})`;
    }
    const a = 0.35 + (t - 0.66) * 0.65;
    return `rgba(220, 38, 38, ${a})`;
  }

  function borderColor(loss) {
    if (!loss) return "#e4e4e7";
    const t = Math.min(1, loss / maxLoss);
    if (t < 0.33) return "#a7f3d0";
    if (t < 0.66) return "#fde68a";
    return "#fecaca";
  }

  const hoverState = hoverCell
    ? {
        code: hoverCell,
        name: STATE_NAMES[hoverCell] || hoverCell,
        loss: lossByState[hoverCell] || 0,
      }
    : null;

  return (
    <div
      className={`rounded-xl bg-white border border-zinc-200 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-red-50 border border-red-200 flex items-center justify-center">
            <MapIcon size={11} className="text-red-700" />
          </div>
          <div>
            <p className="text-[11px] text-zinc-900 font-semibold tracking-tight">
              Loss Exposure by State
            </p>
            <p className="text-[9px] text-zinc-500 font-mono">
              Total: {formatCrores(totalLoss)}
            </p>
          </div>
        </div>
        <Legend />
      </div>

      {/* Grid map */}
      <div className="p-5 grid place-items-center">
        <div
          className="grid gap-1"
          style={{
            gridTemplateColumns: `repeat(${STATE_GRID[0].length}, 36px)`,
            gridTemplateRows: `repeat(${STATE_GRID.length}, 36px)`,
          }}
        >
          {STATE_GRID.flatMap((row, ri) =>
            row.map((code, ci) => {
              if (!code) {
                return (
                  <div
                    key={`${ri}-${ci}`}
                    aria-hidden
                    className="rounded-sm"
                  />
                );
              }
              const loss = lossByState[code] || 0;
              return (
                <motion.button
                  key={`${ri}-${ci}-${code}`}
                  type="button"
                  onMouseEnter={() => setHoverCell(code)}
                  onMouseLeave={() => setHoverCell(null)}
                  whileHover={{ scale: 1.08 }}
                  transition={{ type: "spring", stiffness: 400, damping: 24 }}
                  className="rounded-sm flex items-center justify-center text-[8px] font-bold text-zinc-900 hover:text-zinc-900"
                  style={{
                    background: intensityColor(loss),
                    border: `1px solid ${borderColor(loss)}`,
                  }}
                  aria-label={`${STATE_NAMES[code] || code}: ${formatCrores(
                    loss
                  )}`}
                >
                  {code}
                </motion.button>
              );
            })
          )}
        </div>
      </div>

      {/* Hover detail */}
      <div className="px-4 py-2.5 border-t border-zinc-200 bg-zinc-50 min-h-[36px]">
        {hoverState ? (
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-zinc-900 font-semibold tracking-tight">
              {hoverState.name}
            </span>
            <span className="text-red-700 font-mono tabular-nums">
              {formatCrores(hoverState.loss)}
            </span>
          </div>
        ) : (
          <p className="text-[10px] text-zinc-500">
            Hover a state to see exposure.
          </p>
        )}
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[8px] text-zinc-500 uppercase tracking-wider">
        Low
      </span>
      <div
        className="h-1.5 w-24 rounded-full"
        style={{
          background:
            "linear-gradient(90deg, #059669, #d97706, #dc2626)",
        }}
      />
      <span className="text-[8px] text-zinc-500 uppercase tracking-wider">
        High
      </span>
    </div>
  );
}

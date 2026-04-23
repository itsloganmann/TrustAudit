import { motion } from "framer-motion";
import DocumentStatePill from "./DocumentStatePill.jsx";
import ConfidenceBar from "./ConfidenceBar.jsx";
import EdgeCaseBadges from "./EdgeCaseBadges.jsx";

const rowVariants = {
  initial: { opacity: 0, x: -8 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: 8 },
};

function formatINR(amount) {
  if (amount === null || amount === undefined) return "—";
  try {
    return `INR ${Number(amount).toLocaleString("en-IN")}`;
  } catch {
    return `INR ${amount}`;
  }
}

function riskBarColor(invoice) {
  if (invoice.state === "VERIFIED" || invoice.state === "SUBMITTED_TO_GOV") {
    return "bg-emerald-500";
  }
  if (invoice.state === "DISPUTED") return "bg-red-500";
  if (invoice.state === "NEEDS_INFO") return "bg-amber-500";
  if (invoice.days_remaining !== undefined) {
    if (invoice.days_remaining <= 3) return "bg-red-500";
    if (invoice.days_remaining <= 14) return "bg-amber-500";
  }
  return "bg-zinc-300";
}

/**
 * Single table row for the new vendor dashboard. Renders the same density
 * as Dashboard.jsx but adds confidence + edge cases + DocumentStatePill.
 */
export default function InvoiceRow({ invoice, onSelect }) {
  const cases = Array.isArray(invoice.detected_edge_cases)
    ? invoice.detected_edge_cases
    : [];

  return (
    <motion.tr
      layout
      variants={rowVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={() => onSelect?.(invoice)}
      className="row-transition border-b border-zinc-200 cursor-pointer group"
    >
      <td className="px-4 py-3">
        <div className="flex items-center gap-2.5">
          <motion.div
            layoutId={`risk-${invoice.id}`}
            className={`w-0.5 h-8 rounded-full -ml-2 mr-0.5 ${riskBarColor(
              invoice
            )}`}
          />
          <div className="min-w-0">
            <p className="text-[13px] text-zinc-900 font-medium group-hover:text-emerald-700 transition-colors leading-tight tracking-tight truncate">
              {invoice.vendor_name || "Unknown vendor"}
            </p>
            <p className="text-[10px] text-zinc-500 mt-0.5">
              {invoice.invoice_date || "—"}
            </p>
          </div>
        </div>
      </td>

      <td className="px-3 py-3">
        <code className="text-[10px] text-zinc-500 font-mono">
          {invoice.gstin || "—"}
        </code>
      </td>

      <td className="px-3 py-3">
        <span className="text-[12px] text-zinc-700 font-mono">
          {invoice.invoice_number || "—"}
        </span>
      </td>

      <td className="px-3 py-3 text-right">
        <span className="text-[13px] text-zinc-900 font-semibold tabular-nums tracking-tight">
          {formatINR(invoice.invoice_amount)}
        </span>
      </td>

      <td className="px-3 py-3">
        <ConfidenceBar
          confidence={invoice.confidence_score}
          width={92}
        />
      </td>

      <td className="px-3 py-3">
        {cases.length > 0 ? (
          <EdgeCaseBadges cases={cases} max={3} />
        ) : (
          <span className="text-[10px] text-zinc-400">—</span>
        )}
      </td>

      <td className="px-4 py-3 text-center">
        <DocumentStatePill
          state={invoice.state || "PENDING"}
          missingFields={invoice.missing_fields || []}
          layoutId={`state-${invoice.id}`}
        />
      </td>
    </motion.tr>
  );
}

export { rowVariants };

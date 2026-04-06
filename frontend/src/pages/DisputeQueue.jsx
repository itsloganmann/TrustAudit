import { useEffect, useMemo, useState } from "react";
import { Toaster } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Flag, Filter, FileText } from "lucide-react";
import { api } from "../lib/api.js";
import DisputePanel from "../components/disputes/DisputePanel.jsx";
import DisputeBadge from "../components/disputes/DisputeBadge.jsx";
import DocumentStatePill from "../components/invoices/DocumentStatePill.jsx";

const FILTERS = [
  { key: "active", label: "Active" },
  { key: "open", label: "Open" },
  { key: "review", label: "Reviewing" },
  { key: "resolved", label: "Resolved" },
  { key: "all", label: "All" },
];

function matchFilter(d, filter) {
  if (filter === "all") return true;
  if (filter === "active")
    return d.status !== "RESOLVED" && d.status !== "DISMISSED";
  if (filter === "open") return d.status === "OPEN";
  if (filter === "review") return d.status === "UNDER_REVIEW";
  if (filter === "resolved")
    return d.status === "RESOLVED" || d.status === "DISMISSED";
  return true;
}

/**
 * Cross-document dispute queue (for compliance officers / vendor admins).
 */
export default function DisputeQueue() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("active");
  const [selectedId, setSelectedId] = useState(null);

  async function load() {
    try {
      const res = await api("/disputes");
      const list = Array.isArray(res) ? res : res?.disputes || [];
      setItems(list);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const i = setInterval(load, 6000);
    return () => clearInterval(i);
  }, []);

  const filtered = useMemo(
    () => items.filter((d) => matchFilter(d, filter)),
    [items, filter]
  );

  const counts = useMemo(() => {
    const c = { active: 0, open: 0, review: 0, resolved: 0, all: items.length };
    for (const d of items) {
      if (d.status !== "RESOLVED" && d.status !== "DISMISSED") c.active += 1;
      if (d.status === "OPEN") c.open += 1;
      if (d.status === "UNDER_REVIEW") c.review += 1;
      if (d.status === "RESOLVED" || d.status === "DISMISSED") c.resolved += 1;
    }
    return c;
  }, [items]);

  const selected = filtered.find((d) => d.id === selectedId);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-400 font-sans">
      <Toaster position="top-right" theme="dark" />

      <header className="border-b border-white/[0.06] bg-slate-950/60 backdrop-blur-xl sticky top-0 z-30">
        <div className="max-w-[1600px] mx-auto px-6 h-14 flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
              <Flag size={13} className="text-rose-400" />
            </div>
            <h1 className="text-[14px] text-white font-bold tracking-tight">
              Dispute Queue
            </h1>
          </div>

          <div className="flex items-center gap-1 glass rounded-lg p-0.5 ml-auto">
            <Filter size={11} className="text-slate-600 ml-2" />
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-all flex items-center gap-1.5 ${
                  filter === f.key
                    ? "bg-white/[0.08] text-white border border-white/[0.1]"
                    : "text-slate-500 hover:text-slate-300 border border-transparent"
                }`}
              >
                {f.label}
                <span className="text-[9px] text-slate-600 tabular-nums">
                  {counts[f.key]}
                </span>
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-[1600px] mx-auto px-6 py-5 grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* List */}
        <div className="lg:col-span-2 glass rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-white/[0.06] text-[10px] text-slate-500 uppercase tracking-widest">
                <th className="text-left px-4 py-2.5 font-semibold">Document</th>
                <th className="text-left px-3 py-2.5 font-semibold">Reason</th>
                <th className="text-left px-3 py-2.5 font-semibold">State</th>
                <th className="text-left px-3 py-2.5 font-semibold">Status</th>
                <th className="text-right px-4 py-2.5 font-semibold">
                  Created
                </th>
              </tr>
            </thead>
            <tbody>
              <AnimatePresence mode="popLayout" initial={false}>
                {filtered.map((d) => (
                  <motion.tr
                    key={d.id}
                    layout
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 8 }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                    onClick={() => setSelectedId(d.id)}
                    className={`row-transition border-b border-white/[0.04] cursor-pointer ${
                      selectedId === d.id ? "bg-white/[0.04]" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText size={11} className="text-slate-600" />
                        <div>
                          <p className="text-[12px] text-white font-medium tracking-tight">
                            {d.invoice_number || `#${d.invoice_id}`}
                          </p>
                          <p className="text-[10px] text-slate-600 mt-0.5">
                            {d.vendor_name || "—"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-[11px] text-slate-300">
                      {d.reason || "—"}
                    </td>
                    <td className="px-3 py-3">
                      {d.invoice_state && (
                        <DocumentStatePill state={d.invoice_state} />
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <DisputeBadge status={d.status} />
                    </td>
                    <td className="px-4 py-3 text-right text-[10px] text-slate-600 font-mono">
                      {d.created_at
                        ? new Date(d.created_at).toLocaleDateString("en-IN")
                        : "—"}
                    </td>
                  </motion.tr>
                ))}
              </AnimatePresence>
            </tbody>
          </table>

          {!loading && filtered.length === 0 && (
            <div className="px-4 py-16 text-center text-[12px] text-slate-600">
              No disputes match the current filter.
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="lg:col-span-1">
          {selected ? (
            <DisputePanel
              invoiceId={selected.invoice_id}
              disputes={[selected]}
              canResolve
              onChange={() => load()}
            />
          ) : (
            <div className="rounded-xl glass p-8 text-center">
              <Flag size={18} className="mx-auto text-slate-700 mb-2" />
              <p className="text-[11px] text-slate-600">
                Select a dispute to view details and resolve.
              </p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

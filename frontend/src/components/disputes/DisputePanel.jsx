import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flag,
  Plus,
  Send,
  X,
  CheckCircle2,
  AlertCircle,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "../../lib/api.js";
import DisputeBadge from "./DisputeBadge.jsx";

/**
 * @typedef {object} Dispute
 * @property {string|number} id
 * @property {string} status
 * @property {string} reason
 * @property {string} [details]
 * @property {string} created_at
 * @property {string} [resolved_at]
 * @property {string} [resolution_note]
 * @property {string} [created_by]
 */

const REASON_OPTIONS = [
  { value: "amount_mismatch", label: "Amount mismatch" },
  { value: "wrong_gstin", label: "Wrong GSTIN" },
  { value: "duplicate_filing", label: "Duplicate filing" },
  { value: "date_invalid", label: "Date invalid" },
  { value: "fraudulent", label: "Fraudulent document" },
  { value: "other", label: "Other" },
];

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/**
 * Create + resolve UI for a single invoice's disputes.
 */
export default function DisputePanel({
  invoiceId,
  disputes = [],
  onChange,
  canCreate = true,
  canResolve = false,
  className = "",
}) {
  const [composerOpen, setComposerOpen] = useState(false);
  const [reason, setReason] = useState(REASON_OPTIONS[0].value);
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resolvingId, setResolvingId] = useState(null);
  const [resolutionNote, setResolutionNote] = useState("");

  async function handleCreate() {
    if (!invoiceId || submitting) return;
    setSubmitting(true);
    try {
      const result = await api(`/invoices/${invoiceId}/disputes`, {
        method: "POST",
        body: { reason, details },
      });
      toast.success("Dispute filed", {
        description: "We've notified the counterparty.",
      });
      const next = Array.isArray(result?.disputes)
        ? result.disputes
        : [...disputes, result];
      onChange?.(next);
      setComposerOpen(false);
      setDetails("");
      setReason(REASON_OPTIONS[0].value);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err?.message || "Failed";
      toast.error("Could not file dispute", { description: message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleResolve(disputeId, status) {
    if (!disputeId) return;
    try {
      const result = await api(
        `/invoices/${invoiceId}/disputes/${disputeId}/resolve`,
        {
          method: "POST",
          body: { status, resolution_note: resolutionNote },
        }
      );
      toast.success(
        status === "RESOLVED" ? "Dispute resolved" : "Dispute dismissed"
      );
      const next = Array.isArray(result?.disputes)
        ? result.disputes
        : disputes.map((d) =>
            d.id === disputeId
              ? { ...d, status, resolution_note: resolutionNote }
              : d
          );
      onChange?.(next);
      setResolvingId(null);
      setResolutionNote("");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err?.message || "Failed";
      toast.error("Could not resolve", { description: message });
    }
  }

  const activeCount = disputes.filter(
    (d) => d.status !== "RESOLVED" && d.status !== "DISMISSED"
  ).length;

  return (
    <div
      className={`rounded-xl bg-white border border-zinc-200 overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 bg-zinc-50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-red-50 border border-red-200 flex items-center justify-center">
            <Flag size={11} className="text-red-700" />
          </div>
          <p className="text-[10px] text-zinc-700 uppercase tracking-widest font-semibold">
            Disputes
          </p>
          {activeCount > 0 && (
            <span className="text-[9px] text-red-700 font-mono tabular-nums">
              {activeCount} active
            </span>
          )}
        </div>
        {canCreate && !composerOpen && (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-zinc-700 hover:text-zinc-900 bg-white hover:bg-zinc-50 border border-zinc-200 transition-colors"
          >
            <Plus size={10} strokeWidth={2.5} />
            New
          </button>
        )}
      </div>

      {/* Composer */}
      <AnimatePresence>
        {composerOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-zinc-200"
          >
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[9px] text-zinc-500 uppercase tracking-widest mb-1.5">
                  Reason
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-[11px] text-zinc-900 focus:outline-none focus:border-zinc-300"
                >
                  {REASON_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-zinc-500 uppercase tracking-widest mb-1.5">
                  Details
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={3}
                  placeholder="Describe the discrepancy with as much detail as possible..."
                  className="w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-[11px] text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-300 resize-none"
                />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-semibold text-zinc-600 hover:text-zinc-900 border border-zinc-200 hover:bg-zinc-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting || !details.trim()}
                  onClick={handleCreate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white bg-red-600 hover:bg-red-700 border border-red-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <Send size={10} strokeWidth={2.5} />
                  File Dispute
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      <div className="divide-y divide-zinc-100">
        {disputes.length === 0 && !composerOpen && (
          <div className="px-4 py-8 text-center">
            <CheckCircle2
              size={16}
              className="mx-auto text-emerald-500 mb-2"
            />
            <p className="text-[11px] text-zinc-500">
              No disputes filed for this document.
            </p>
          </div>
        )}
        {disputes.map((d) => (
          <div key={d.id} className="px-4 py-3">
            <div className="flex items-start gap-3">
              <div className="mt-0.5">
                <DisputeBadge status={d.status} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] text-zinc-900 font-semibold tracking-tight">
                  {(
                    REASON_OPTIONS.find((o) => o.value === d.reason)?.label ||
                    d.reason ||
                    "Other"
                  )}
                </p>
                {d.details && (
                  <p className="mt-1 text-[10px] text-zinc-600 leading-snug">
                    {d.details}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-3 text-[9px] text-zinc-500 font-mono">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={8} />
                    {formatDate(d.created_at)}
                  </span>
                  {d.created_by && <span>by {d.created_by}</span>}
                </div>
                {d.resolution_note && (
                  <div className="mt-2 rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-1.5">
                    <p className="text-[10px] text-emerald-700 leading-snug">
                      {d.resolution_note}
                    </p>
                  </div>
                )}

                {canResolve &&
                  d.status !== "RESOLVED" &&
                  d.status !== "DISMISSED" && (
                    <div className="mt-2.5">
                      {resolvingId === d.id ? (
                        <div className="space-y-2">
                          <textarea
                            value={resolutionNote}
                            onChange={(e) => setResolutionNote(e.target.value)}
                            rows={2}
                            placeholder="Resolution note..."
                            className="w-full bg-white border border-zinc-200 rounded-md px-2 py-1.5 text-[10px] text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-300 resize-none"
                          />
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setResolvingId(null);
                                setResolutionNote("");
                              }}
                              className="p-1 rounded-md text-zinc-500 hover:text-zinc-900 border border-zinc-200 hover:bg-zinc-50"
                            >
                              <X size={10} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleResolve(d.id, "DISMISSED")
                              }
                              className="px-2 py-1 rounded-md text-[9px] font-semibold text-zinc-600 hover:text-zinc-900 border border-zinc-200 hover:bg-zinc-50"
                            >
                              Dismiss
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResolve(d.id, "RESOLVED")}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200"
                            >
                              <CheckCircle2 size={9} />
                              Resolve
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setResolvingId(d.id)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold text-zinc-700 hover:text-zinc-900 border border-zinc-200 hover:bg-zinc-50 transition-colors"
                        >
                          <AlertCircle size={9} />
                          Resolve
                        </button>
                      )}
                    </div>
                  )}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

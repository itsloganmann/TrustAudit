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
 *
 * @param {object} props
 * @param {string|number} props.invoiceId
 * @param {Dispute[]} [props.disputes]
 * @param {(updated:Dispute[])=>void} [props.onChange]
 * @param {boolean} [props.canCreate=true]
 * @param {boolean} [props.canResolve=false]
 * @param {string} [props.className]
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
      className={`rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-rose-500/10 border border-rose-500/20 flex items-center justify-center">
            <Flag size={11} className="text-rose-400" />
          </div>
          <p className="text-[10px] text-slate-400 uppercase tracking-widest font-semibold">
            Disputes
          </p>
          {activeCount > 0 && (
            <span className="text-[9px] text-rose-300 font-mono tabular-nums">
              {activeCount} active
            </span>
          )}
        </div>
        {canCreate && !composerOpen && (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-semibold text-slate-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
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
            className="overflow-hidden border-b border-white/[0.06]"
          >
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-[9px] text-slate-500 uppercase tracking-widest mb-1.5">
                  Reason
                </label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] text-white focus:outline-none focus:border-white/[0.18]"
                >
                  {REASON_OPTIONS.map((o) => (
                    <option
                      key={o.value}
                      value={o.value}
                      className="bg-slate-900"
                    >
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[9px] text-slate-500 uppercase tracking-widest mb-1.5">
                  Details
                </label>
                <textarea
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                  rows={3}
                  placeholder="Describe the discrepancy with as much detail as possible..."
                  className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-3 py-2 text-[11px] text-white placeholder-slate-600 focus:outline-none focus:border-white/[0.18] resize-none"
                />
              </div>
              <div className="flex items-center gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => setComposerOpen(false)}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-semibold text-slate-400 hover:text-white border border-white/[0.08] hover:bg-white/[0.05] transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={submitting || !details.trim()}
                  onClick={handleCreate}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-semibold text-white bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
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
      <div className="divide-y divide-white/[0.04]">
        {disputes.length === 0 && !composerOpen && (
          <div className="px-4 py-8 text-center">
            <CheckCircle2
              size={16}
              className="mx-auto text-emerald-500/40 mb-2"
            />
            <p className="text-[11px] text-slate-600">
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
                <p className="text-[11px] text-white font-semibold tracking-tight">
                  {(
                    REASON_OPTIONS.find((o) => o.value === d.reason)?.label ||
                    d.reason ||
                    "Other"
                  )}
                </p>
                {d.details && (
                  <p className="mt-1 text-[10px] text-slate-400 leading-snug">
                    {d.details}
                  </p>
                )}
                <div className="mt-1.5 flex items-center gap-3 text-[9px] text-slate-600 font-mono">
                  <span className="inline-flex items-center gap-1">
                    <Clock size={8} />
                    {formatDate(d.created_at)}
                  </span>
                  {d.created_by && <span>by {d.created_by}</span>}
                </div>
                {d.resolution_note && (
                  <div className="mt-2 rounded-md bg-emerald-500/5 border border-emerald-500/15 px-2.5 py-1.5">
                    <p className="text-[10px] text-emerald-300 leading-snug">
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
                            className="w-full bg-white/[0.03] border border-white/[0.08] rounded-md px-2 py-1.5 text-[10px] text-white placeholder-slate-600 focus:outline-none focus:border-white/[0.18] resize-none"
                          />
                          <div className="flex items-center gap-1.5 justify-end">
                            <button
                              type="button"
                              onClick={() => {
                                setResolvingId(null);
                                setResolutionNote("");
                              }}
                              className="p-1 rounded-md text-slate-500 hover:text-white border border-white/[0.08] hover:bg-white/[0.05]"
                            >
                              <X size={10} />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleResolve(d.id, "DISMISSED")
                              }
                              className="px-2 py-1 rounded-md text-[9px] font-semibold text-slate-400 hover:text-white border border-white/[0.08] hover:bg-white/[0.05]"
                            >
                              Dismiss
                            </button>
                            <button
                              type="button"
                              onClick={() => handleResolve(d.id, "RESOLVED")}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold text-emerald-300 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/25"
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
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[9px] font-semibold text-slate-300 hover:text-white border border-white/[0.08] hover:bg-white/[0.05] transition-colors"
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

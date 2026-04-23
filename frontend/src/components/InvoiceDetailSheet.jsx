import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  X,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Camera,
  ShieldCheck,
  AlertTriangle,
  Scan,
  Sparkles,
} from "lucide-react";
import AnnotationOverlay from "./AnnotationOverlay";
import JustificationCanvas from "./JustificationCanvas.jsx";
import { api, ApiError } from "../lib/api";

/* ─────────────────────────────────────────────
   Evidence Drawer — slides from right on row click.
   Left: mock WhatsApp chat showing driver sending photo.
   Right: Extracted data with green checkmarks.
   ───────────────────────────────────────────── */

const backdrop = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.22, ease: [0.22, 1, 0.36, 1] },
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.18, ease: "easeIn" },
  },
};

const panel = {
  hidden: { x: "100%" },
  visible: { x: 0, transition: { type: "spring", stiffness: 260, damping: 28 } },
  exit: { x: "100%", transition: { duration: 0.25, ease: "easeIn" } },
};

const panelReduced = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.15 } },
  exit: { opacity: 0, transition: { duration: 0.15 } },
};

export default function InvoiceDetailSheet({ invoice, onClose }) {
  const shouldReduceMotion = useReducedMotion();
  const panelVariants = shouldReduceMotion ? panelReduced : panel;

  // Justification fetch + per-invoice cache. Hooks must run on every render.
  // We keep a ref-backed cache and a single state object keyed by invoice id
  // so the derived render values don't need synchronous setState in effects.
  const cacheRef = useRef(new Map());
  const [fetchState, setFetchState] = useState({ id: null, status: "idle", payload: null });
  const invoiceId = invoice?.id ?? null;

  useEffect(() => {
    if (!invoiceId) return undefined;

    // Cache hit — emit synchronously inside the effect (one render cycle).
    if (cacheRef.current.has(invoiceId)) {
      setFetchState({ id: invoiceId, status: "ready", payload: cacheRef.current.get(invoiceId) });
      return undefined;
    }

    let cancelled = false;
    setFetchState({ id: invoiceId, status: "loading", payload: null });

    api(`/invoices/${invoiceId}/justification`)
      .then((payload) => {
        if (cancelled) return;
        cacheRef.current.set(invoiceId, payload);
        setFetchState({ id: invoiceId, status: "ready", payload });
      })
      .catch((err) => {
        if (cancelled) return;
        const httpStatus = err instanceof ApiError ? err.status : 0;
        // Auth/404/etc — silently fall back so the rest of the drawer still renders.
        setFetchState({
          id: invoiceId,
          status: httpStatus === 401 || httpStatus === 403 ? "unauthorized" : "error",
          payload: null,
        });
      });

    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  if (!invoice) return null;
  const ok = invoice.status === "VERIFIED";

  // Only show data for the currently-open invoice. Stale entries (from a
  // prior selection still in flight) are ignored.
  const justification = fetchState.id === invoiceId ? fetchState.payload : null;
  const justificationStatus = fetchState.id === invoiceId ? fetchState.status : "idle";

  return (
    <AnimatePresence>
      {invoice && (
        <>
          {/* Overlay */}
          <motion.div
            key="drawer-overlay"
            variants={backdrop}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed inset-0 z-50 drawer-overlay"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="drawer-panel"
            variants={panelVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[900px] bg-white border-l border-zinc-200 shadow-sm flex flex-col will-change-transform"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-50 border border-zinc-200 flex items-center justify-center">
                  <FileText size={14} className="text-zinc-500" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] text-zinc-900 font-semibold tracking-tight">
                      {invoice.invoice_number}
                    </h2>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                        ok
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }`}
                    >
                      {ok ? "Clear to claim" : "Missing proof"}
                    </span>
                  </div>
                  <p className="text-[12px] text-zinc-500 mt-0.5">
                    {invoice.vendor_name} / {invoice.gstin}
                  </p>
                </div>
              </div>
              <motion.button
                onClick={onClose}
                whileHover={shouldReduceMotion ? undefined : { scale: 1.03, transition: { type: "spring", stiffness: 300, damping: 24 } }}
                whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                className="w-8 h-8 rounded-lg bg-white hover:bg-zinc-50 border border-zinc-200 flex items-center justify-center text-zinc-500 hover:text-zinc-900 transition-colors"
              >
                <X size={14} />
              </motion.button>
            </div>

            {/* ── Body: Justification canvas + two columns ── */}
            <div className="flex-1 overflow-y-auto">
              {/* Decision summary */}
              <div className="px-5 pt-5">
                <div className="flex items-center justify-between mb-3">
                  <SectionHeader icon={Sparkles} title="Decision summary" />
                  {justificationStatus === "loading" && (
                    <span className="text-[10px] text-zinc-500 uppercase tracking-wider">
                      Loading...
                    </span>
                  )}
                  {justificationStatus === "error" && (
                    <span className="text-[10px] text-red-700 uppercase tracking-wider">
                      Unavailable
                    </span>
                  )}
                  {justificationStatus === "unauthorized" && (
                    <span className="text-[10px] text-amber-700 uppercase tracking-wider">
                      Sign in to view
                    </span>
                  )}
                </div>
                <JustificationCanvas
                  invoiceId={invoice.id}
                  confidence={justification?.confidence_score ?? 0}
                  deductionInr={justification?.deduction_estimate_inr ?? 0}
                  totalRecoverableInr={justification?.total_recoverable_inr ?? 0}
                  availableFields={justification?.available_fields ?? []}
                  missingFields={justification?.missing_fields ?? []}
                  recommendations={justification?.recommendations ?? []}
                />
              </div>

              <div className="grid grid-cols-2 gap-0 h-full">
                {/* LEFT: WhatsApp Chat Simulation */}
                <div className="border-r border-zinc-200 p-5 flex flex-col">
                  <SectionHeader icon={MessageSquare} title="Proof trail" />

                  <div className="mt-4 flex-1 rounded-xl bg-zinc-50 border border-zinc-200 overflow-hidden flex flex-col">
                    {/* Chat header */}
                    <div className="px-4 py-3 bg-white border-b border-zinc-200 flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                        <span className="text-[11px] font-bold text-emerald-700">DR</span>
                      </div>
                      <div>
                        <p className="text-[12px] text-zinc-900 font-medium">Supplier driver - {invoice.vendor_name}</p>
                        <p className="text-[10px] text-emerald-700">online</p>
                      </div>
                    </div>

                    {/* Chat messages */}
                    <div className="flex-1 p-4 space-y-3 bg-zinc-50">
                      {/* System message */}
                      <div className="text-center">
                        <span className="text-[9px] text-zinc-500 bg-white border border-zinc-200 px-2 py-0.5 rounded-full">
                          TODAY
                        </span>
                      </div>

                      {/* Driver message */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="flex justify-start"
                      >
                        <div className="bg-white border border-zinc-200 rounded-xl rounded-tl-sm px-3 py-2 max-w-[80%]">
                          <p className="text-[11px] text-zinc-700">
                            Sir, uploading challan for {invoice.vendor_name}
                          </p>
                          <p className="text-[9px] text-zinc-500 mt-1 text-right">10:32 AM</p>
                        </div>
                      </motion.div>

                      {/* Photo message */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="flex justify-start"
                      >
                        <div className="bg-white border border-zinc-200 rounded-xl rounded-tl-sm p-1.5 max-w-[75%]">
                          {/* Simulated challan image */}
                          <div className="rounded-lg bg-white border border-zinc-200 p-3 aspect-[4/3] flex flex-col justify-between text-zinc-900">
                            <div className="text-center border-b border-zinc-200 pb-2">
                              <p className="text-[9px] font-bold tracking-wide">DELIVERY CHALLAN</p>
                              <p className="text-[7px] text-zinc-500">Acceptance proof submitted by supplier driver</p>
                            </div>
                            <div className="space-y-1 text-[8px] flex-1 py-2">
                              <ChallanLine label="Challan No" value={`ITNS-${invoice.invoice_number}`} />
                              <ChallanLine label="Assessee" value={invoice.vendor_name} />
                              <ChallanLine label="GSTIN" value={invoice.gstin} />
                              <ChallanLine
                                label="Amount"
                                value={`INR ${invoice.invoice_amount.toLocaleString("en-IN")}`}
                                bold
                              />
                              <ChallanLine label="Date" value={invoice.date_of_acceptance} />
                            </div>
                            <div className="border-t border-zinc-200 pt-1.5 flex items-center justify-between">
                              <span className="text-[7px] text-zinc-400">Auto-verified</span>
                              {ok && (
                                <div className="w-8 h-8 rounded-full border border-emerald-400 flex items-center justify-center rotate-[-12deg]">
                                  <span className="text-[5px] text-emerald-700 font-bold text-center leading-tight">
                                    CLEARED
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 px-1.5 py-1">
                            <Camera size={10} className="text-zinc-500" />
                            <p className="text-[10px] text-zinc-600">challan_photo.jpg</p>
                          </div>
                          <p className="text-[9px] text-zinc-500 px-1.5 pb-0.5 text-right">10:33 AM</p>
                        </div>
                      </motion.div>

                      {/* Bot response */}
                      {ok && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.9 }}
                          className="flex justify-end"
                        >
                          <div className="bg-emerald-50 border border-emerald-200 rounded-xl rounded-tr-sm px-3 py-2 max-w-[80%]">
                            <p className="text-[11px] text-emerald-700">
                              Proof matched. Date of acceptance confirmed: {invoice.date_of_acceptance}.
                              Invoice is cleared to claim.
                            </p>
                            <p className="text-[9px] text-emerald-700 mt-1 text-right">10:33 AM</p>
                          </div>
                        </motion.div>
                      )}

                      {!ok && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.9 }}
                          className="flex justify-center pt-4"
                        >
                          <div className="flex items-center gap-2 text-[11px] text-red-700 bg-red-50 px-3 py-2 rounded-lg border border-red-200">
                            <AlertTriangle size={12} />
                            Awaiting acceptance proof from supplier driver
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>

                {/* RIGHT: Extracted Data + Compliance */}
                <div className="p-5 flex flex-col gap-5">
                  <SectionHeader icon={Scan} title="Extracted fields" />

                  {/* Invoice details */}
                  <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
                        Invoice record
                      </p>
                    </div>
                    <div className="px-4 py-1">
                      <DataRow label="Supplier" value={invoice.vendor_name} />
                      <DataRow label="GSTIN" value={invoice.gstin} mono />
                      <DataRow label="Invoice #" value={invoice.invoice_number} mono />
                      <DataRow
                        label="Amount"
                        value={`INR ${invoice.invoice_amount.toLocaleString("en-IN")}`}
                        bold
                      />
                      <DataRow label="Invoice date" value={invoice.invoice_date} />
                      <DataRow label="Date of acceptance" value={invoice.date_of_acceptance} highlight />
                      <DataRow label="Payment window ends" value={invoice.deadline_43bh} />
                      <DataRow
                        label="Days until window closes"
                        value={invoice.days_remaining <= 0 ? "Window closed" : `${invoice.days_remaining} days`}
                        color={
                          invoice.days_remaining <= 3
                            ? "#dc2626"
                            : invoice.days_remaining <= 14
                            ? "#d97706"
                            : "#047857"
                        }
                      />
                    </div>
                  </div>

                  {/* Annotation Overlay — animated SVG bounding boxes on rendered challan */}
                  {invoice?.id != null && <AnnotationOverlay invoiceId={invoice.id} />}

                  {/* AI Extraction Results */}
                  {ok && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="rounded-xl bg-white border border-zinc-200 overflow-hidden"
                    >
                      <div className="px-4 py-2.5 bg-emerald-50 border-b border-emerald-200">
                        <p className="text-[10px] text-emerald-700 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                          <ShieldCheck size={11} />
                          Vision AI extraction
                        </p>
                      </div>
                      <div className="p-3 grid grid-cols-2 gap-2">
                        <VerificationBadge label="OCR confidence" value="98.7%" ok />
                        <VerificationBadge label="Acceptance date" value={invoice.date_of_acceptance} ok />
                        <VerificationBadge label="GSTIN match" value="Confirmed" ok />
                        <VerificationBadge label="Amount match" value="Confirmed" ok />
                        <VerificationBadge label="Signature" value="Detected" ok />
                        <VerificationBadge label="Stamp seal" value="Present" ok />
                      </div>
                    </motion.div>
                  )}

                  {/* Compliance Timeline */}
                  <div className="rounded-xl bg-white border border-zinc-200 overflow-hidden">
                    <div className="px-4 py-2.5 bg-zinc-50 border-b border-zinc-200">
                      <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
                        Decision trail
                      </p>
                    </div>
                    <div className="p-4 space-y-3">
                      <TimelineStep
                        label="Invoice created"
                        date={invoice.invoice_date}
                        done
                      />
                      <TimelineStep
                        label="Date of acceptance"
                        date={invoice.date_of_acceptance}
                        done
                      />
                      <TimelineStep
                        label="Acceptance proof received"
                        date={
                          ok && invoice.verified_at
                            ? new Date(invoice.verified_at).toLocaleDateString()
                            : null
                        }
                        done={ok}
                      />
                      <TimelineStep
                        label="Cleared to claim"
                        date={
                          ok && invoice.verified_at
                            ? new Date(invoice.verified_at).toLocaleDateString()
                            : null
                        }
                        done={ok}
                        last
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/* ── Sub-components ── */

function SectionHeader({ icon: Icon, title }) {
  return (
    <div className="flex items-center gap-2 relative rounded-md pr-2">
      <div className="w-6 h-6 rounded-md bg-zinc-50 border border-zinc-200 flex items-center justify-center">
        <Icon size={12} className="text-zinc-500" />
      </div>
      <p className="text-[12px] text-zinc-900 font-semibold tracking-tight">{title}</p>
    </div>
  );
}

function ChallanLine({ label, value, bold }) {
  return (
    <div className="flex justify-between">
      <span className="text-zinc-500">{label}</span>
      <span className={bold ? "font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}

function DataRow({ label, value, mono, bold, color, highlight }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0">
      <span className="text-[10px] text-zinc-500 uppercase tracking-wider">{label}</span>
      <span
        className={`text-[12px] ${bold ? "font-semibold" : "font-medium"} ${
          mono ? "font-mono text-[11px]" : ""
        } ${highlight ? "text-blue-700" : ""}`}
        style={{ color: color || (bold ? "#09090b" : highlight ? undefined : "#3f3f46") }}
      >
        {value}
      </span>
    </div>
  );
}

function VerificationBadge({ label, value }) {
  return (
    <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 flex items-start gap-2">
      <CheckCircle2 size={12} className="text-emerald-700 mt-0.5 shrink-0" />
      <div>
        <p className="text-[9px] text-zinc-500 leading-tight">{label}</p>
        <p className="text-[11px] text-emerald-700 font-semibold mt-0.5">{value}</p>
      </div>
    </div>
  );
}

function TimelineStep({ label, date, done, last }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex flex-col items-center">
        <div
          className={`w-6 h-6 rounded-lg flex items-center justify-center ${
            done
              ? "bg-emerald-50 border border-emerald-200"
              : "bg-white border border-zinc-200"
          }`}
        >
          {done ? (
            <CheckCircle2 size={12} className="text-emerald-700" />
          ) : (
            <Clock size={12} className="text-zinc-400" />
          )}
        </div>
        {!last && (
          <div className={`w-px h-4 mt-1 ${done ? "bg-emerald-200" : "bg-zinc-200"}`} />
        )}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className={`text-[11px] font-medium ${done ? "text-zinc-700" : "text-zinc-400"}`}>
          {label}
        </p>
        {date && <p className="text-[9px] text-zinc-500 font-mono mt-0.5">{date}</p>}
      </div>
    </div>
  );
}

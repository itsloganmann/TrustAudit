import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  CheckCircle2,
  Clock,
  FileText,
  MessageSquare,
  Camera,
  ShieldCheck,
  AlertTriangle,
  ArrowRight,
  Scan,
} from "lucide-react";

/* ─────────────────────────────────────────────
   Evidence Drawer — slides from right on row click.
   Left: mock WhatsApp chat showing driver sending photo.
   Right: Extracted data with green checkmarks.
   ───────────────────────────────────────────── */

const backdrop = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
  exit: { opacity: 0 },
};

const panel = {
  hidden: { x: "100%" },
  visible: { x: 0, transition: { type: "spring", stiffness: 300, damping: 34 } },
  exit: { x: "100%", transition: { duration: 0.25, ease: "easeIn" } },
};

export default function InvoiceDetailSheet({ invoice, onClose }) {
  if (!invoice) return null;
  const ok = invoice.status === "VERIFIED";

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
            variants={panel}
            initial="hidden"
            animate="visible"
            exit="exit"
            className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-[900px] bg-slate-950/95 backdrop-blur-xl border-l border-white/[0.06] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
                  <FileText size={14} className="text-slate-400" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-[15px] text-white font-semibold tracking-tight">
                      {invoice.invoice_number}
                    </h2>
                    <span
                      className={`text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        ok
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                      }`}
                    >
                      {ok ? "VERIFIED" : "PENDING"}
                    </span>
                  </div>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    {invoice.vendor_name} / {invoice.gstin}
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.08] border border-white/[0.08] flex items-center justify-center text-slate-500 hover:text-white transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            {/* ── Body: Two columns ── */}
            <div className="flex-1 overflow-y-auto">
              <div className="grid grid-cols-2 gap-0 h-full">
                {/* LEFT: WhatsApp Chat Simulation */}
                <div className="border-r border-white/[0.06] p-5 flex flex-col">
                  <SectionHeader icon={MessageSquare} title="WhatsApp Evidence Trail" />

                  <div className="mt-4 flex-1 rounded-xl bg-slate-900/60 border border-white/[0.06] overflow-hidden flex flex-col">
                    {/* Chat header */}
                    <div className="px-4 py-3 bg-white/[0.03] border-b border-white/[0.06] flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-emerald-500/20 flex items-center justify-center">
                        <span className="text-[11px] font-bold text-emerald-400">DR</span>
                      </div>
                      <div>
                        <p className="text-[12px] text-white font-medium">Driver - {invoice.vendor_name}</p>
                        <p className="text-[10px] text-emerald-400">online</p>
                      </div>
                    </div>

                    {/* Chat messages */}
                    <div className="flex-1 p-4 space-y-3 bg-[#0a0f1a]">
                      {/* System message */}
                      <div className="text-center">
                        <span className="text-[9px] text-slate-600 bg-slate-800/50 px-2 py-0.5 rounded-full">
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
                        <div className="bg-slate-800/80 border border-white/[0.06] rounded-xl rounded-tl-sm px-3 py-2 max-w-[80%]">
                          <p className="text-[11px] text-slate-300">
                            Sir, uploading challan for {invoice.vendor_name}
                          </p>
                          <p className="text-[9px] text-slate-600 mt-1 text-right">10:32 AM</p>
                        </div>
                      </motion.div>

                      {/* Photo message */}
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.6 }}
                        className="flex justify-start"
                      >
                        <div className="bg-slate-800/80 border border-white/[0.06] rounded-xl rounded-tl-sm p-1.5 max-w-[75%]">
                          {/* Simulated challan image */}
                          <div className="rounded-lg bg-white p-3 aspect-[4/3] flex flex-col justify-between text-slate-900">
                            <div className="text-center border-b border-slate-200 pb-2">
                              <p className="text-[9px] font-bold tracking-wide">TAX CHALLAN</p>
                              <p className="text-[7px] text-slate-500">Government of India - Income Tax Department</p>
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
                            <div className="border-t border-slate-200 pt-1.5 flex items-center justify-between">
                              <span className="text-[7px] text-slate-400">Auto-verified</span>
                              {ok && (
                                <div className="w-8 h-8 rounded-full border border-emerald-400/40 flex items-center justify-center rotate-[-12deg]">
                                  <span className="text-[5px] text-emerald-500 font-bold text-center leading-tight">
                                    VERIFIED
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 px-1.5 py-1">
                            <Camera size={10} className="text-slate-500" />
                            <p className="text-[10px] text-slate-400">challan_photo.jpg</p>
                          </div>
                          <p className="text-[9px] text-slate-600 px-1.5 pb-0.5 text-right">10:33 AM</p>
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
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl rounded-tr-sm px-3 py-2 max-w-[80%]">
                            <p className="text-[11px] text-emerald-300">
                              Challan verified. Date of acceptance confirmed: {invoice.date_of_acceptance}.
                              43B(h) compliance secured.
                            </p>
                            <p className="text-[9px] text-emerald-600 mt-1 text-right">10:33 AM</p>
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
                          <div className="flex items-center gap-2 text-[11px] text-rose-400 bg-rose-500/8 px-3 py-2 rounded-lg border border-rose-500/15">
                            <AlertTriangle size={12} />
                            Awaiting challan upload from driver
                          </div>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>

                {/* RIGHT: Extracted Data + Compliance */}
                <div className="p-5 flex flex-col gap-5">
                  <SectionHeader icon={Scan} title="Extracted Verification Data" />

                  {/* Invoice details */}
                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                    <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06]">
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                        Invoice Record
                      </p>
                    </div>
                    <div className="px-4 py-1">
                      <DataRow label="Vendor" value={invoice.vendor_name} />
                      <DataRow label="GSTIN" value={invoice.gstin} mono />
                      <DataRow label="Invoice #" value={invoice.invoice_number} mono />
                      <DataRow
                        label="Amount"
                        value={`INR ${invoice.invoice_amount.toLocaleString("en-IN")}`}
                        bold
                      />
                      <DataRow label="Invoice Date" value={invoice.invoice_date} />
                      <DataRow label="Date of Acceptance" value={invoice.date_of_acceptance} highlight />
                      <DataRow label="43B(h) Deadline" value={invoice.deadline_43bh} />
                      <DataRow
                        label="Days Remaining"
                        value={invoice.days_remaining <= 0 ? "OVERDUE" : `${invoice.days_remaining} days`}
                        color={
                          invoice.days_remaining <= 3
                            ? "#f43f5e"
                            : invoice.days_remaining <= 14
                            ? "#f59e0b"
                            : "#10b981"
                        }
                      />
                    </div>
                  </div>

                  {/* AI Extraction Results */}
                  {ok && (
                    <motion.div
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.4 }}
                      className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden"
                    >
                      <div className="px-4 py-2.5 bg-emerald-500/5 border-b border-emerald-500/10">
                        <p className="text-[10px] text-emerald-400 uppercase tracking-widest font-semibold flex items-center gap-1.5">
                          <ShieldCheck size={11} />
                          Vision AI Extraction
                        </p>
                      </div>
                      <div className="p-3 grid grid-cols-2 gap-2">
                        <VerificationBadge label="OCR Confidence" value="98.7%" ok />
                        <VerificationBadge label="Date Extracted" value={invoice.date_of_acceptance} ok />
                        <VerificationBadge label="GSTIN Match" value="Confirmed" ok />
                        <VerificationBadge label="Amount Match" value="Confirmed" ok />
                        <VerificationBadge label="Signature" value="Detected" ok />
                        <VerificationBadge label="Stamp Seal" value="Present" ok />
                      </div>
                    </motion.div>
                  )}

                  {/* Compliance Timeline */}
                  <div className="rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden">
                    <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/[0.06]">
                      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
                        Compliance Timeline
                      </p>
                    </div>
                    <div className="p-4 space-y-3">
                      <TimelineStep
                        label="Invoice Created"
                        date={invoice.invoice_date}
                        done
                      />
                      <TimelineStep
                        label="Date of Acceptance"
                        date={invoice.date_of_acceptance}
                        done
                      />
                      <TimelineStep
                        label="WhatsApp Challan Upload"
                        date={
                          ok && invoice.verified_at
                            ? new Date(invoice.verified_at).toLocaleDateString()
                            : null
                        }
                        done={ok}
                      />
                      <TimelineStep
                        label="43B(h) Tax Shield Secured"
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
    <div className="flex items-center gap-2">
      <div className="w-6 h-6 rounded-md bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
        <Icon size={12} className="text-slate-400" />
      </div>
      <p className="text-[12px] text-white font-semibold tracking-tight">{title}</p>
    </div>
  );
}

function ChallanLine({ label, value, bold }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={bold ? "font-bold" : "font-medium"}>{value}</span>
    </div>
  );
}

function DataRow({ label, value, mono, bold, color, highlight }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/[0.04] last:border-0">
      <span className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</span>
      <span
        className={`text-[12px] ${bold ? "font-semibold" : "font-medium"} ${
          mono ? "font-mono text-[11px]" : ""
        } ${highlight ? "text-blue-400" : ""}`}
        style={{ color: color || (bold ? "#f8fafc" : highlight ? undefined : "#94a3b8") }}
      >
        {value}
      </span>
    </div>
  );
}

function VerificationBadge({ label, value, ok }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/[0.06] p-2.5 flex items-start gap-2">
      <CheckCircle2 size={12} className="text-emerald-400 mt-0.5 shrink-0" />
      <div>
        <p className="text-[9px] text-slate-500 leading-tight">{label}</p>
        <p className="text-[11px] text-emerald-400 font-semibold mt-0.5">{value}</p>
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
              ? "bg-emerald-500/10 border border-emerald-500/20"
              : "bg-white/[0.03] border border-white/[0.08]"
          }`}
        >
          {done ? (
            <CheckCircle2 size={12} className="text-emerald-400" />
          ) : (
            <Clock size={12} className="text-slate-600" />
          )}
        </div>
        {!last && (
          <div className={`w-px h-4 mt-1 ${done ? "bg-emerald-500/20" : "bg-white/[0.06]"}`} />
        )}
      </div>
      <div className="flex-1 min-w-0 pt-0.5">
        <p className={`text-[11px] font-medium ${done ? "text-slate-300" : "text-slate-600"}`}>
          {label}
        </p>
        {date && <p className="text-[9px] text-slate-600 font-mono mt-0.5">{date}</p>}
      </div>
    </div>
  );
}

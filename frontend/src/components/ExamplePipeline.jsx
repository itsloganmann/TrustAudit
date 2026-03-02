import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Camera,
  ScanSearch,
  FileText,
  Sparkles,
  DatabaseZap,
  ChevronRight,
  CheckCircle2,
  AlertTriangle,
  MessageCircle,
  ArrowRight,
  Eye,
} from "lucide-react";

/* ─────────────────── DEMO DATA ─────────────────── */

const PURCHASE_ORDER = {
  vendor: "Rajesh Steel Works",
  gstin: "27AADCR4328K1ZG",
  invoiceNo: "INV-2024-0847",
  date: "14-Jan-2025",
  amount: "₹4,50,000",
  items: [
    { desc: "MS Plates 12mm", qty: "40 MT", rate: "₹6,250/MT", total: "₹2,50,000" },
    { desc: "HR Coils 2.5mm", qty: "25 MT", rate: "₹8,000/MT", total: "₹2,00,000" },
  ],
  acceptance: "14-Jan-2025",
};

/* Simulated raw OCR output with realistic typos */
const RAW_OCR = `PURCHASE 0RDER
Rajesh Ste3l Wcrks
GSTIM: 27AADCR4328K1ZG
lnvoice No: INV-2O24-O847
Dat3: l4-Jan-2O25
-------------------------------
MS Plat3s 12mm    40 MT   ₹6,25O/MT
HR Co1ls 2.5mm   25 MT   ₹8,0OO/MT
-------------------------------
Total: ₹4,5O,OOO
Date of Acc3ptance: l4-Jan-2O25
MSME Reg: UDYAM-MH-26-OO12345`;

const CORRECTED = `PURCHASE ORDER
Rajesh Steel Works
GSTIN: 27AADCR4328K1ZG
Invoice No: INV-2024-0847
Date: 14-Jan-2025
-------------------------------
MS Plates 12mm    40 MT   ₹6,250/MT
HR Coils 2.5mm   25 MT   ₹8,000/MT
-------------------------------
Total: ₹4,50,000
Date of Acceptance: 14-Jan-2025
MSME Reg: UDYAM-MH-26-0012345`;

/* Words the OCR got wrong — highlight positions */
const TYPO_FIXES = [
  { wrong: "0RDER", right: "ORDER" },
  { wrong: "Ste3l", right: "Steel" },
  { wrong: "Wcrks", right: "Works" },
  { wrong: "GSTIM", right: "GSTIN" },
  { wrong: "lnvoice", right: "Invoice" },
  { wrong: "INV-2O24-O847", right: "INV-2024-0847" },
  { wrong: "Dat3", right: "Date" },
  { wrong: "l4-Jan-2O25", right: "14-Jan-2025" },
  { wrong: "Plat3s", right: "Plates" },
  { wrong: "₹6,25O/MT", right: "₹6,250/MT" },
  { wrong: "Co1ls", right: "Coils" },
  { wrong: "₹8,0OO/MT", right: "₹8,000/MT" },
  { wrong: "₹4,5O,OOO", right: "₹4,50,000" },
  { wrong: "Acc3ptance", right: "Acceptance" },
  { wrong: "UDYAM-MH-26-OO12345", right: "UDYAM-MH-26-0012345" },
];

/* Key fields to extract (for green highlighting) */
const KEY_FIELDS = [
  { label: "Vendor", value: "Rajesh Steel Works", color: "#10b981" },
  { label: "GSTIN", value: "27AADCR4328K1ZG", color: "#10b981" },
  { label: "Invoice No", value: "INV-2024-0847", color: "#3b82f6" },
  { label: "Date", value: "14-Jan-2025", color: "#3b82f6" },
  { label: "Total Amount", value: "₹4,50,000", color: "#10b981" },
  { label: "Date of Acceptance", value: "14-Jan-2025", color: "#f59e0b" },
  { label: "MSME Reg", value: "UDYAM-MH-26-0012345", color: "#8b5cf6" },
];

/* ─────────────────── STEPS CONFIG ─────────────────── */

const STEPS = [
  {
    id: 0,
    icon: Camera,
    title: "WhatsApp Photo Received",
    subtitle: "Driver uploads challan photo from warehouse",
    color: "#10b981",
  },
  {
    id: 1,
    icon: ScanSearch,
    title: "Key Areas Detected",
    subtitle: "Vision AI identifies critical data fields",
    color: "#3b82f6",
  },
  {
    id: 2,
    icon: FileText,
    title: "Raw OCR Transcription",
    subtitle: "Direct text extraction — typos and all",
    color: "#f59e0b",
  },
  {
    id: 3,
    icon: Sparkles,
    title: "AI-Corrected Output",
    subtitle: "Predictive model fixes OCR errors",
    color: "#8b5cf6",
  },
  {
    id: 4,
    icon: DatabaseZap,
    title: "Added to Dashboard",
    subtitle: "Data flows into compliance engine",
    color: "#10b981",
  },
];

/* ─────────────────── SUBCOMPONENTS ─────────────────── */

/* Step 0 — Mock WhatsApp with challan image */
function WhatsAppView() {
  return (
    <div className="flex flex-col h-full">
      {/* WhatsApp header */}
      <div className="flex items-center gap-3 px-4 py-2.5 bg-[#1f2c34] border-b border-white/[0.06] rounded-t-xl">
        <div className="w-8 h-8 rounded-full bg-slate-600 flex items-center justify-center text-[11px] font-bold text-white">RS</div>
        <div>
          <p className="text-[13px] text-white font-medium">Ramesh (Driver)</p>
          <p className="text-[10px] text-slate-400">online</p>
        </div>
      </div>
      {/* Chat area */}
      <div className="flex-1 p-4 space-y-3 bg-[#0b141a] overflow-auto">
        {/* Incoming message */}
        <div className="max-w-[85%]">
          <div className="bg-[#1f2c34] rounded-xl rounded-tl-sm p-2 shadow-lg">
            {/* Purchase order preview */}
            <div className="relative rounded-lg overflow-hidden bg-[#f5f0e8] p-0">
              <PurchaseOrderImage />
            </div>
            <p className="text-[12px] text-slate-300 mt-2 px-1">Sir challan photo 👆 from Rajesh Steel warehouse</p>
            <p className="text-[9px] text-slate-500 text-right mt-1">8:47 AM</p>
          </div>
        </div>
        {/* Outgoing auto-reply */}
        <div className="max-w-[85%] ml-auto">
          <div className="bg-[#005c4b] rounded-xl rounded-tr-sm p-2.5">
            <p className="text-[12px] text-slate-200">✅ Received. Processing challan for INV-2024-0847.</p>
            <p className="text-[9px] text-slate-400 text-right mt-1">8:47 AM ✓✓</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* CSS-rendered crumpled purchase order */
function PurchaseOrderImage() {
  return (
    <div className="relative" style={{ fontFamily: "'Courier New', monospace" }}>
      {/* Paper texture */}
      <div
        className="p-4 text-[10px] leading-[1.6] text-[#2a2520] relative"
        style={{
          background: `
            radial-gradient(ellipse at 72% 25%, rgba(139,119,82,0.25) 0%, transparent 50%),
            radial-gradient(ellipse at 20% 70%, rgba(120,100,60,0.2) 0%, transparent 40%),
            radial-gradient(ellipse at 85% 80%, rgba(100,80,50,0.15) 0%, transparent 35%),
            linear-gradient(135deg, #f5f0e8 0%, #ede5d5 30%, #f0e8d8 60%, #e8dfc8 100%)
          `,
          boxShadow: "inset 0 0 60px rgba(0,0,0,0.08)",
        }}
      >
        {/* Oil stain overlays */}
        <div
          className="absolute"
          style={{
            top: "15%", left: "60%",
            width: "80px", height: "60px",
            background: "radial-gradient(ellipse, rgba(120,100,50,0.3) 0%, rgba(100,80,40,0.15) 40%, transparent 70%)",
            borderRadius: "50%",
            transform: "rotate(-15deg)",
            filter: "blur(3px)",
          }}
        />
        <div
          className="absolute"
          style={{
            top: "55%", left: "10%",
            width: "50px", height: "40px",
            background: "radial-gradient(ellipse, rgba(80,70,40,0.25) 0%, rgba(80,60,30,0.1) 50%, transparent 75%)",
            borderRadius: "50%",
            transform: "rotate(20deg)",
            filter: "blur(2px)",
          }}
        />
        {/* Crumple fold lines */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: `
            linear-gradient(155deg, transparent 30%, rgba(0,0,0,0.03) 30.5%, transparent 31%),
            linear-gradient(40deg, transparent 55%, rgba(0,0,0,0.025) 55.5%, transparent 56%),
            linear-gradient(100deg, transparent 70%, rgba(255,255,255,0.06) 70.5%, transparent 71%)
          `,
        }} />

        {/* Document content */}
        <div className="relative z-10">
          <p className="text-center font-bold text-[12px] mb-0.5 tracking-wide">PURCHASE ORDER</p>
          <div className="border-b border-[#c0b8a0] mb-2" />
          <p className="font-bold text-[11px]">Rajesh Steel Works</p>
          <p className="text-[9px] text-[#5a5040]">GSTIN: 27AADCR4328K1ZG</p>
          <p className="text-[9px] text-[#5a5040]">Invoice No: INV-2024-0847</p>
          <p className="text-[9px] text-[#5a5040] mb-2">Date: 14-Jan-2025</p>
          <div className="border-t border-dashed border-[#c0b8a0] pt-1.5 mb-1.5">
            <div className="flex justify-between text-[9px] font-bold text-[#3a3020] mb-1">
              <span className="w-[40%]">Item</span>
              <span className="w-[15%] text-right">Qty</span>
              <span className="w-[20%] text-right">Rate</span>
              <span className="w-[20%] text-right">Total</span>
            </div>
            {PURCHASE_ORDER.items.map((item, i) => (
              <div key={i} className="flex justify-between text-[9px] text-[#4a4030] mb-0.5">
                <span className="w-[40%]">{item.desc}</span>
                <span className="w-[15%] text-right">{item.qty}</span>
                <span className="w-[20%] text-right">{item.rate}</span>
                <span className="w-[20%] text-right">{item.total}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-dashed border-[#c0b8a0] pt-1.5">
            <p className="text-right font-bold text-[11px]">Total: ₹4,50,000</p>
          </div>
          <div className="mt-2 pt-1.5 border-t border-[#c0b8a0]">
            <p className="text-[9px]"><span className="font-bold">Date of Acceptance:</span> 14-Jan-2025</p>
            <p className="text-[9px] text-[#5a5040]">MSME Reg: UDYAM-MH-26-0012345</p>
          </div>
          {/* Stamp */}
          <div
            className="absolute bottom-3 right-3"
            style={{
              border: "2px solid rgba(200,50,50,0.3)",
              borderRadius: "50%",
              width: "45px",
              height: "45px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              transform: "rotate(-12deg)",
              color: "rgba(200,50,50,0.35)",
              fontSize: "7px",
              fontWeight: "bold",
              textAlign: "center",
              lineHeight: "1.1",
            }}
          >
            ACCEPTED<br />✓
          </div>
        </div>
      </div>
    </div>
  );
}

/* Step 1 — Highlighted key areas */
function HighlightedView() {
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
        <Eye size={14} className="text-blue-400" />
        <span className="text-[12px] text-white font-medium">Vision AI — Key Field Detection</span>
      </div>
      <div className="flex-1 p-4 overflow-auto">
        <div className="relative rounded-lg overflow-hidden">
          <PurchaseOrderImage />
          {/* Green highlight overlays */}
          <div className="absolute inset-0 pointer-events-none">
            {/* Vendor name highlight */}
            <div className="absolute" style={{ top: "25%", left: "5%", width: "55%", height: "9%", background: "rgba(16, 185, 129, 0.2)", border: "1.5px solid rgba(16, 185, 129, 0.6)", borderRadius: "3px" }} />
            {/* GSTIN highlight */}
            <div className="absolute" style={{ top: "34%", left: "5%", width: "70%", height: "7%", background: "rgba(16, 185, 129, 0.15)", border: "1.5px solid rgba(16, 185, 129, 0.5)", borderRadius: "3px" }} />
            {/* Invoice & Date highlight */}
            <div className="absolute" style={{ top: "41%", left: "5%", width: "65%", height: "12%", background: "rgba(59, 130, 246, 0.15)", border: "1.5px solid rgba(59, 130, 246, 0.5)", borderRadius: "3px" }} />
            {/* Total highlight */}
            <div className="absolute" style={{ top: "76%", left: "40%", width: "55%", height: "8%", background: "rgba(16, 185, 129, 0.2)", border: "1.5px solid rgba(16, 185, 129, 0.6)", borderRadius: "3px" }} />
            {/* Date of Acceptance highlight */}
            <div className="absolute" style={{ top: "85%", left: "5%", width: "75%", height: "7%", background: "rgba(245, 158, 11, 0.2)", border: "1.5px solid rgba(245, 158, 11, 0.5)", borderRadius: "3px" }} />
          </div>
        </div>
        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { label: "Identity", color: "#10b981" },
            { label: "Invoice Data", color: "#3b82f6" },
            { label: "Compliance Critical", color: "#f59e0b" },
          ].map((l) => (
            <span key={l.label} className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="w-2 h-2 rounded-sm" style={{ background: l.color, opacity: 0.7 }} />
              {l.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* Step 2 — Raw OCR with typo highlights */
function RawOCRView() {
  const lines = RAW_OCR.split("\n");
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <FileText size={14} className="text-amber-400" />
          <span className="text-[12px] text-white font-medium">Raw OCR Output</span>
        </div>
        <span className="text-[10px] text-amber-400/70 flex items-center gap-1">
          <AlertTriangle size={10} />
          {TYPO_FIXES.length} errors detected
        </span>
      </div>
      <div className="flex-1 p-4 overflow-auto">
        <pre className="text-[11px] leading-[1.7] font-mono whitespace-pre-wrap">
          {lines.map((line, i) => (
            <span key={i}>
              <span className="text-slate-600 select-none mr-3 text-[9px]">{String(i + 1).padStart(2, "0")}</span>
              <HighlightTypos text={line} />
              {"\n"}
            </span>
          ))}
        </pre>
      </div>
    </div>
  );
}

/* Highlight typos in red within OCR text */
function HighlightTypos({ text }) {
  let result = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    let earliestIdx = remaining.length;
    let matchedFix = null;

    for (const fix of TYPO_FIXES) {
      const idx = remaining.indexOf(fix.wrong);
      if (idx !== -1 && idx < earliestIdx) {
        earliestIdx = idx;
        matchedFix = fix;
      }
    }

    if (matchedFix) {
      if (earliestIdx > 0) {
        result.push(<span key={keyIdx++} className="text-slate-400">{remaining.slice(0, earliestIdx)}</span>);
      }
      result.push(
        <span key={keyIdx++} className="text-rose-400 bg-rose-400/10 px-0.5 rounded" title={`Should be: ${matchedFix.right}`}>
          {matchedFix.wrong}
        </span>
      );
      remaining = remaining.slice(earliestIdx + matchedFix.wrong.length);
    } else {
      result.push(<span key={keyIdx++} className="text-slate-400">{remaining}</span>);
      remaining = "";
    }
  }

  return <>{result}</>;
}

/* Step 3 — AI Corrected output with green highlights */
function CorrectedView() {
  const lines = CORRECTED.split("\n");
  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-violet-400" />
          <span className="text-[12px] text-white font-medium">AI-Corrected Output</span>
        </div>
        <span className="text-[10px] text-emerald-400/70 flex items-center gap-1">
          <CheckCircle2 size={10} />
          {TYPO_FIXES.length} corrections applied
        </span>
      </div>
      <div className="flex-1 p-4 overflow-auto">
        <pre className="text-[11px] leading-[1.7] font-mono whitespace-pre-wrap">
          {lines.map((line, i) => (
            <span key={i}>
              <span className="text-slate-600 select-none mr-3 text-[9px]">{String(i + 1).padStart(2, "0")}</span>
              <HighlightCorrections text={line} />
              {"\n"}
            </span>
          ))}
        </pre>
        {/* Diff summary */}
        <div className="mt-4 pt-3 border-t border-white/[0.06]">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Corrections Applied</p>
          <div className="grid grid-cols-2 gap-1.5">
            {TYPO_FIXES.slice(0, 8).map((fix, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                <span className="text-rose-400 line-through opacity-60">{fix.wrong}</span>
                <ArrowRight size={8} className="text-slate-600" />
                <span className="text-emerald-400">{fix.right}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* Highlight corrected words in green */
function HighlightCorrections({ text }) {
  let result = [];
  let remaining = text;
  let keyIdx = 0;

  while (remaining.length > 0) {
    let earliestIdx = remaining.length;
    let matchedFix = null;

    for (const fix of TYPO_FIXES) {
      const idx = remaining.indexOf(fix.right);
      if (idx !== -1 && idx < earliestIdx) {
        earliestIdx = idx;
        matchedFix = fix;
      }
    }

    if (matchedFix) {
      if (earliestIdx > 0) {
        result.push(<span key={keyIdx++} className="text-slate-400">{remaining.slice(0, earliestIdx)}</span>);
      }
      result.push(
        <span key={keyIdx++} className="text-emerald-400 bg-emerald-400/10 px-0.5 rounded">
          {matchedFix.right}
        </span>
      );
      remaining = remaining.slice(earliestIdx + matchedFix.right.length);
    } else {
      result.push(<span key={keyIdx++} className="text-slate-400">{remaining}</span>);
      remaining = "";
    }
  }

  return <>{result}</>;
}

/* Step 4 — Dashboard integration */
function DashboardView() {
  const [animPhase, setAnimPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setAnimPhase(1), 500);
    const t2 = setTimeout(() => setAnimPhase(2), 1200);
    const t3 = setTimeout(() => setAnimPhase(3), 1800);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div className="flex flex-col h-full">
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center gap-2">
        <DatabaseZap size={14} className="text-emerald-400" />
        <span className="text-[12px] text-white font-medium">Dashboard Integration</span>
      </div>
      <div className="flex-1 p-4 space-y-3 overflow-auto">
        {/* Extracted fields */}
        <div className="space-y-1.5">
          <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Extracted Data</p>
          {KEY_FIELDS.map((field, i) => (
            <motion.div
              key={field.label}
              initial={{ opacity: 0, x: -10 }}
              animate={animPhase >= 1 ? { opacity: 1, x: 0 } : {}}
              transition={{ delay: i * 0.08, duration: 0.3 }}
              className="flex items-center justify-between py-1 px-2 rounded-md bg-white/[0.02]"
            >
              <span className="text-[10px] text-slate-500">{field.label}</span>
              <span className="text-[11px] font-medium" style={{ color: field.color }}>{field.value}</span>
            </motion.div>
          ))}
        </div>

        {/* Compliance check */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={animPhase >= 2 ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.4 }}
          className="rounded-lg p-3 border border-emerald-500/20 bg-emerald-500/[0.05]"
        >
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 size={14} className="text-emerald-400" />
            <span className="text-[12px] text-emerald-400 font-medium">43B(h) Compliance Check</span>
          </div>
          <div className="grid grid-cols-2 gap-2 text-[10px]">
            <div>
              <span className="text-slate-500">Acceptance Date</span>
              <p className="text-white font-medium">14-Jan-2025</p>
            </div>
            <div>
              <span className="text-slate-500">Payment Deadline</span>
              <p className="text-amber-400 font-medium">28-Feb-2025 (45 days)</p>
            </div>
            <div>
              <span className="text-slate-500">Amount Protected</span>
              <p className="text-emerald-400 font-medium glow-emerald">₹4,50,000</p>
            </div>
            <div>
              <span className="text-slate-500">Tax Shield</span>
              <p className="text-emerald-400 font-medium glow-emerald">₹1,35,000</p>
            </div>
          </div>
        </motion.div>

        {/* Added to dashboard confirmation */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={animPhase >= 3 ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.3 }}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.03] border border-white/[0.06]"
        >
          <div className="w-6 h-6 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <CheckCircle2 size={12} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-[11px] text-white font-medium">Added to Dashboard</p>
            <p className="text-[9px] text-slate-500">Invoice INV-2024-0847 is now being tracked</p>
          </div>
        </motion.div>
      </div>
    </div>
  );
}

/* ─────────────────── MAIN COMPONENT ─────────────────── */

const VIEW_MAP = [WhatsAppView, HighlightedView, RawOCRView, CorrectedView, DashboardView];

export default function ExamplePipeline() {
  const [activeStep, setActiveStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(true);
  const intervalRef = useRef(null);

  useEffect(() => {
    if (!autoPlay) return;
    intervalRef.current = setInterval(() => {
      setActiveStep((s) => (s + 1) % STEPS.length);
    }, 5000);
    return () => clearInterval(intervalRef.current);
  }, [autoPlay]);

  const handleStepClick = (i) => {
    setActiveStep(i);
    setAutoPlay(false);
    clearInterval(intervalRef.current);
  };

  const ActiveView = VIEW_MAP[activeStep];

  return (
    <section className="mt-8 mb-2">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-5">
        <div className="flex items-center gap-2">
          <div className="w-1 h-5 rounded-full bg-gradient-to-b from-blue-500 to-emerald-500" />
          <h2 className="text-white font-semibold text-[15px] tracking-tight">How It Works</h2>
        </div>
        <span className="text-[10px] text-slate-600 font-medium px-2 py-0.5 rounded-md bg-white/[0.03] border border-white/[0.06]">
          Live Example
        </span>
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        {/* Step tabs */}
        <div className="flex items-center border-b border-white/[0.06] overflow-x-auto">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            const isActive = i === activeStep;
            const isPast = i < activeStep;
            return (
              <button
                key={step.id}
                onClick={() => handleStepClick(i)}
                className={`group relative flex items-center gap-2 px-4 py-3 text-[11px] font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? "text-white bg-white/[0.04]"
                    : isPast
                    ? "text-slate-400"
                    : "text-slate-600 hover:text-slate-400"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-md flex items-center justify-center transition-all ${
                    isActive
                      ? "bg-white/10"
                      : isPast
                      ? "bg-white/[0.04]"
                      : "bg-white/[0.02]"
                  }`}
                  style={isActive ? { boxShadow: `0 0 12px ${step.color}30` } : {}}
                >
                  {isPast ? (
                    <CheckCircle2 size={11} className="text-emerald-400" />
                  ) : (
                    <Icon size={11} style={isActive ? { color: step.color } : {}} />
                  )}
                </div>
                <span className="hidden sm:inline">{step.title}</span>
                {i < STEPS.length - 1 && (
                  <ChevronRight size={10} className="text-slate-700 ml-1" />
                )}
                {/* Active indicator bar */}
                {isActive && (
                  <motion.div
                    layoutId="activeStepBar"
                    className="absolute bottom-0 left-0 right-0 h-[2px]"
                    style={{ background: `linear-gradient(90deg, ${step.color}, transparent)` }}
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
              </button>
            );
          })}
          {/* Auto-play indicator */}
          <div className="ml-auto px-3 flex items-center">
            <button
              onClick={() => setAutoPlay(!autoPlay)}
              className={`text-[9px] px-2 py-1 rounded-md border transition-all ${
                autoPlay
                  ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/[0.05]"
                  : "text-slate-600 border-white/[0.06] hover:text-slate-400"
              }`}
            >
              {autoPlay ? "● Auto" : "○ Paused"}
            </button>
          </div>
        </div>

        {/* Content area */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr,1fr] min-h-[420px]">
          {/* Left: Visual */}
          <div className="border-r border-white/[0.06]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStep}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 10 }}
                transition={{ duration: 0.25 }}
                className="h-full"
              >
                <ActiveView />
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Right: Description */}
          <div className="p-5 flex flex-col justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeStep}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.25 }}
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${STEPS[activeStep].color}15`, boxShadow: `0 0 20px ${STEPS[activeStep].color}10` }}
                  >
                    {(() => { const Icon = STEPS[activeStep].icon; return <Icon size={18} style={{ color: STEPS[activeStep].color }} />; })()}
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 uppercase tracking-wider">Step {activeStep + 1} of {STEPS.length}</p>
                    <h3 className="text-white font-semibold text-[15px] tracking-tight">{STEPS[activeStep].title}</h3>
                  </div>
                </div>

                <p className="text-[13px] text-slate-400 leading-relaxed mb-5">
                  {STEP_DESCRIPTIONS[activeStep]}
                </p>

                {/* Step navigation */}
                <div className="flex items-center gap-2">
                  {activeStep < STEPS.length - 1 && (
                    <button
                      onClick={() => handleStepClick(activeStep + 1)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-medium text-white bg-white/[0.06] border border-white/[0.08] hover:bg-white/[0.1] transition-all"
                    >
                      Next Step <ChevronRight size={12} />
                    </button>
                  )}
                  {/* Progress dots */}
                  <div className="flex items-center gap-1 ml-2">
                    {STEPS.map((_, i) => (
                      <div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full transition-all cursor-pointer"
                        style={{
                          background: i === activeStep ? STEPS[activeStep].color : i < activeStep ? "#10b981" : "rgba(255,255,255,0.1)",
                          boxShadow: i === activeStep ? `0 0 6px ${STEPS[activeStep].color}60` : "none",
                        }}
                        onClick={() => handleStepClick(i)}
                      />
                    ))}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

const STEP_DESCRIPTIONS = [
  "A driver at the Rajesh Steel Works warehouse photographs the purchase order challan and sends it via WhatsApp. The paper has oil stains and fold marks from being handled on the shop floor — exactly how real documents arrive.",
  "Our Vision AI scans the image and identifies critical data fields: vendor identity, GSTIN, invoice details, amounts, and most importantly — the Date of Acceptance that determines the 43B(h) compliance deadline.",
  "The raw OCR engine extracts text directly from the crumpled paper. Notice the errors: 'Ste3l' instead of 'Steel', '0RDER' instead of 'ORDER', zeros confused with the letter O. This is what typical OCR produces on damaged documents.",
  "Our predictive model cross-references extracted text against known patterns, vendor databases, and GSTIN checksums to correct every OCR error. 15 corrections are applied automatically with 99.2% confidence.",
  "The verified data flows directly into the TrustAudit compliance engine. The system calculates the 45-day payment deadline, tracks the ₹4,50,000 deduction at risk, and begins the countdown timer.",
];

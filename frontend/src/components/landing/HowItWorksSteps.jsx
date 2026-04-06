import { motion } from "framer-motion";
import {
  FileImage,
  MessageCircle,
  Cpu,
  LayoutDashboard,
  FileBadge,
  ArrowRight,
} from "lucide-react";

const STEPS = [
  {
    icon: FileImage,
    title: "Paper challan",
    caption: "A driver hands over a printed delivery challan at the dock.",
    accent: "#f59e0b",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp photo",
    caption: "The driver snaps a photo and sends it to the TrustAudit bot.",
    accent: "#10b981",
  },
  {
    icon: Cpu,
    title: "Vision + OCR",
    caption: "Gemini extracts Date, GSTIN, amount, and invoice number with confidence scores.",
    accent: "#3b82f6",
  },
  {
    icon: LayoutDashboard,
    title: "Live dashboard",
    caption: "The CFO sees the row flash amber then turn green — all in under 15 seconds.",
    accent: "#8b5cf6",
  },
  {
    icon: FileBadge,
    title: "43B(h) PDF",
    caption: "One tap generates a filing-ready compliance form with audit trail and QR authenticity.",
    accent: "#f43f5e",
  },
];

export default function HowItWorksSteps() {
  return (
    <section id="how-it-works" className="relative py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ type: "spring", stiffness: 90, damping: 20 }}
          className="text-center mb-14"
        >
          <p className="text-[11px] text-emerald-400 uppercase tracking-[0.3em] font-semibold mb-3">
            How it works
          </p>
          <h2 className="text-[32px] md:text-[44px] font-bold text-white tracking-tight leading-tight">
            From a printed challan to a filed ITR,
            <br />
            <span className="text-slate-500">in under 15 seconds.</span>
          </h2>
        </motion.div>

        {/* Desktop: horizontal rail with arrows */}
        <div className="hidden lg:flex items-stretch justify-between gap-2">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <div key={step.title} className="flex items-stretch flex-1">
                <motion.div
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, amount: 0.4 }}
                  transition={{
                    delay: i * 0.12,
                    type: "spring",
                    stiffness: 90,
                    damping: 20,
                  }}
                  className="glass glass-hover rounded-2xl p-5 flex-1 flex flex-col items-center text-center group"
                >
                  <div
                    className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all group-hover:scale-105"
                    style={{
                      background: `${step.accent}18`,
                      border: `1px solid ${step.accent}33`,
                      boxShadow: `0 0 24px ${step.accent}26`,
                    }}
                  >
                    <Icon size={22} strokeWidth={2} style={{ color: step.accent }} />
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-1">
                    Step {i + 1}
                  </p>
                  <h3 className="text-[15px] font-semibold text-white tracking-tight mb-2">
                    {step.title}
                  </h3>
                  <p className="text-[12px] text-slate-400 leading-relaxed">
                    {step.caption}
                  </p>
                </motion.div>
                {i < STEPS.length - 1 && (
                  <div className="flex items-center px-1">
                    <ArrowRight size={18} className="text-slate-700" />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Mobile + tablet: vertical stack */}
        <div className="lg:hidden space-y-4">
          {STEPS.map((step, i) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, x: -12 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.5 }}
                transition={{ delay: i * 0.08, type: "spring", stiffness: 100, damping: 20 }}
                className="glass rounded-2xl p-5 flex items-start gap-4"
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{
                    background: `${step.accent}18`,
                    border: `1px solid ${step.accent}33`,
                  }}
                >
                  <Icon size={22} strokeWidth={2} style={{ color: step.accent }} />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold mb-1">
                    Step {i + 1}
                  </p>
                  <h3 className="text-[16px] font-semibold text-white tracking-tight mb-1">
                    {step.title}
                  </h3>
                  <p className="text-[13px] text-slate-400 leading-relaxed">
                    {step.caption}
                  </p>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

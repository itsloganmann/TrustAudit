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
    title: "Proof arrives",
    caption: "A driver snaps a delivery photo. A supplier emails a signed POD. A warehouse stamps a GRN. Every channel flows in.",
    accent: "#059669",
  },
  {
    icon: MessageCircle,
    title: "WhatsApp, PDF, photo",
    caption: "We ingest from the channels your suppliers already use. No new app, no portal, nothing for them to sign up for.",
    accent: "#059669",
  },
  {
    icon: Cpu,
    title: "Match to invoice",
    caption: "Vision and retrieval pull out vendor, quantities, dates, signatures, and bind them to the matching invoice or shipment line.",
    accent: "#059669",
  },
  {
    icon: LayoutDashboard,
    title: "AP gets a verdict",
    caption: "Every invoice lands in one queue with one of three states: clear to claim, disputed, or missing proof.",
    accent: "#059669",
  },
  {
    icon: FileBadge,
    title: "Audit-ready bundle",
    caption: "One tap exports the matched invoice, the proof evidence, and a timestamped decision trail for finance and audit.",
    accent: "#059669",
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
          <p className="text-[11px] text-emerald-700 uppercase tracking-[0.3em] font-semibold mb-3">
            How it works
          </p>
          <h2 className="text-[32px] md:text-[44px] font-bold text-zinc-900 tracking-tight leading-tight">
            From scattered proof to an AP verdict,
            <br />
            <span className="text-zinc-500">in one queue.</span>
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
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-all group-hover:scale-105 bg-emerald-50 border border-emerald-200">
                    <Icon size={22} strokeWidth={2} className="text-emerald-700" />
                  </div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold mb-1">
                    Step {i + 1}
                  </p>
                  <h3 className="text-[15px] font-semibold text-zinc-900 tracking-tight mb-2">
                    {step.title}
                  </h3>
                  <p className="text-[12px] text-zinc-600 leading-relaxed">
                    {step.caption}
                  </p>
                </motion.div>
                {i < STEPS.length - 1 && (
                  <div className="flex items-center px-1">
                    <ArrowRight size={18} className="text-zinc-400" />
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
                <div className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-emerald-50 border border-emerald-200">
                  <Icon size={22} strokeWidth={2} className="text-emerald-700" />
                </div>
                <div>
                  <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold mb-1">
                    Step {i + 1}
                  </p>
                  <h3 className="text-[16px] font-semibold text-zinc-900 tracking-tight mb-1">
                    {step.title}
                  </h3>
                  <p className="text-[13px] text-zinc-600 leading-relaxed">
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

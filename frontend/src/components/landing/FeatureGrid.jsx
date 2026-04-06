import { motion } from "framer-motion";
import {
  Eye,
  Gauge,
  Workflow,
  MessageSquareWarning,
  FileBadge,
  Users,
} from "lucide-react";

const FEATURES = [
  {
    icon: Eye,
    title: "Real-time vision OCR",
    desc: "Gemini 2.5 Flash reads any challan photo in under 2 seconds, with field-level bounding boxes and extraction confidence per field.",
    color: "#3b82f6",
    bg: "rgba(59,130,246,0.12)",
  },
  {
    icon: Gauge,
    title: "Calibrated confidence",
    desc: "Every extracted field is scored 0-100. Anything under 85 is routed through a targeted clarification, not guessed.",
    color: "#8b5cf6",
    bg: "rgba(139,92,246,0.12)",
  },
  {
    icon: Workflow,
    title: "Stateful document pipeline",
    desc: "PENDING → VERIFYING → VERIFIED | NEEDS_INFO → SUBMITTED_TO_GOV → DISPUTED. Every transition is auditable and replayable.",
    color: "#10b981",
    bg: "rgba(16,185,129,0.12)",
  },
  {
    icon: MessageSquareWarning,
    title: "WhatsApp-native disputes",
    desc: "If a field is missing the bot replies to the driver in WhatsApp asking for exactly the missing piece. No portals, no apps.",
    color: "#f59e0b",
    bg: "rgba(245,158,11,0.12)",
  },
  {
    icon: FileBadge,
    title: "Government-ready PDFs",
    desc: "One tap generates a 43B(h) compliance form with audit trail, QR authenticity code, and letterhead — ready for ITR filing.",
    color: "#f43f5e",
    bg: "rgba(244,63,94,0.12)",
  },
  {
    icon: Users,
    title: "Role-scoped logins",
    desc: "Google / Facebook / WhatsApp OTP / phone OTP / email magic. Separate vendor and driver flows with DB-backed sessions.",
    color: "#06b6d4",
    bg: "rgba(6,182,212,0.12)",
  },
];

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.06, type: "spring", stiffness: 120, damping: 20 },
  }),
};

export default function FeatureGrid() {
  return (
    <section className="relative py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ type: "spring", stiffness: 90, damping: 20 }}
          className="text-center mb-14"
        >
          <p className="text-[11px] text-emerald-400 uppercase tracking-[0.3em] font-semibold mb-3">
            Built for Indian CFOs
          </p>
          <h2 className="text-[32px] md:text-[44px] font-bold text-white tracking-tight leading-tight">
            Six ways TrustAudit saves you
            <span className="text-slate-500"> from the 45-day cliff.</span>
          </h2>
          <p className="mt-4 text-[15px] text-slate-400 max-w-2xl mx-auto">
            Every step from a paper challan to a filed ITR Schedule BP is
            automated, audited, and defensible under Section 43B(h).
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon;
            return (
              <motion.div
                key={feature.title}
                variants={cardVariants}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true, amount: 0.3 }}
                custom={i}
                className="glass glass-hover rounded-2xl p-6 group transition-all"
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 transition-all group-hover:scale-105"
                  style={{
                    background: feature.bg,
                    boxShadow: `0 0 24px ${feature.bg}`,
                  }}
                >
                  <Icon size={20} strokeWidth={2} style={{ color: feature.color }} />
                </div>
                <h3 className="text-[16px] font-semibold text-white tracking-tight mb-2">
                  {feature.title}
                </h3>
                <p className="text-[13px] text-slate-400 leading-relaxed">{feature.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

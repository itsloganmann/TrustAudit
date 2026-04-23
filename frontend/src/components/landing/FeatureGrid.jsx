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
    title: "Multi-channel proof ingestion",
    desc: "WhatsApp photos, PDFs, signed PODs, stamped GRNs, email attachments. Whatever channel your suppliers already use, we read it.",
  },
  {
    icon: Workflow,
    title: "Invoice-to-proof matching",
    desc: "We bind delivery evidence to the right invoice and shipment line. Vendor, quantity, date, signature, stamp, each verified against what you were billed for.",
  },
  {
    icon: Gauge,
    title: "Clear / disputed / missing",
    desc: "Every invoice gets one of three verdicts AP can act on. Clear to claim means finance can release. Disputed and missing-proof surface exactly what's off so a clerk can close the loop.",
  },
  {
    icon: MessageSquareWarning,
    title: "Supplier follow-up on WhatsApp",
    desc: "If proof is missing, we message the supplier or driver in WhatsApp asking for the specific evidence. No portals, no new logins for them.",
  },
  {
    icon: FileBadge,
    title: "Section 43B(h) use case",
    desc: "One named decision that rides on the proof layer: we flag invoices approaching the 45-day MSME payment window so AP can release them in time to keep the buyer's deduction.",
  },
  {
    icon: Users,
    title: "Audit-ready proof bundles",
    desc: "Every release exports a timestamped bundle: the invoice, the matched evidence, the decision trail, the clerk who approved. Finance and audit get one artifact.",
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
          <p className="text-[11px] text-emerald-700 uppercase tracking-[0.3em] font-semibold mb-3">
            Built for AP teams at Indian enterprises
          </p>
          <h2 className="text-[32px] md:text-[44px] font-bold text-zinc-900 tracking-tight leading-tight">
            The decision layer
            <span className="text-zinc-500"> for invoice acceptance.</span>
          </h2>
          <p className="mt-4 text-[15px] text-zinc-600 max-w-2xl mx-auto">
            Every step from scattered proof to an AP verdict is ingested,
            matched, and bundled. One queue, one audit trail, one artifact
            per release.
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
                <div className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 bg-emerald-50 border border-emerald-200">
                  <Icon size={20} strokeWidth={2} className="text-emerald-700" />
                </div>
                <h3 className="text-[16px] font-semibold text-zinc-900 tracking-tight mb-2">
                  {feature.title}
                </h3>
                <p className="text-[13px] text-zinc-600 leading-relaxed">{feature.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

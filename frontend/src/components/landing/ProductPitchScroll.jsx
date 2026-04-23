import { motion } from "framer-motion";
import { ArrowRight, Clock, TrendingDown, ShieldCheck } from "lucide-react";

/**
 * Narrative scroll section between the hero and the demo CTA.
 * Three beats:
 *   1) The problem — the 45-day cliff
 *   2) The broken workflow — spreadsheets and WhatsApp screenshots
 *   3) The TrustAudit answer — real-time pipeline
 *
 * Designed to slow the CFO's scroll just enough to land the pitch
 * before they hit "Try it live".
 */

const BEATS = [
  {
    icon: Clock,
    accent: "#dc2626",
    accentBg: "bg-red-50",
    accentBorder: "border-red-200",
    accentText: "text-red-700",
    eyebrow: "The question AP can't answer",
    title: "Is this invoice actually safe to pay?",
    body:
      "An Indian AP clerk opens a bill, then opens WhatsApp, then opens a folder of scanned PODs. Somewhere in that stack is the proof the goods landed, in the right quantity, on the right date. If it's there and matches, the invoice is clear. If it doesn't match, finance needs to pause. Today that judgment call happens in someone's head, over email, with no trail.",
  },
  {
    icon: TrendingDown,
    accent: "#d97706",
    accentBg: "bg-amber-50",
    accentBorder: "border-amber-200",
    accentText: "text-amber-700",
    eyebrow: "The workflow that got us here",
    title: "Proof lives in WhatsApp, PDFs, and stamped paperwork.",
    body:
      "Delivery photos arrive in a driver's WhatsApp thread. A signed POD gets emailed as a 2MB PDF. A GRN sits in the ERP with no link back to the supplier challan. The acceptance date, the line items, the stamp, the signature, all of it exists, scattered across channels the ERP cannot see. Nobody tells finance when the match is complete.",
  },
  {
    icon: ShieldCheck,
    accent: "#059669",
    accentBg: "bg-emerald-50",
    accentBorder: "border-emerald-200",
    accentText: "text-emerald-700",
    eyebrow: "TrustAudit",
    title: "The decision layer for invoice acceptance.",
    body:
      "We ingest delivery and acceptance proof from every channel your suppliers already use, match it to the right invoice, and return one of three verdicts: clear to claim, disputed, or missing proof. AP gets a single queue to work. Finance gets an audit-ready bundle for every release.",
  },
];

export default function ProductPitchScroll() {
  return (
    <section id="pitch" className="relative py-20 md:py-28">
      <div className="max-w-5xl mx-auto px-6 space-y-16 md:space-y-24">
        {BEATS.map((beat, i) => {
          const Icon = beat.icon;
          const isOdd = i % 2 === 1;
          return (
            <motion.div
              key={beat.title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ type: "spring", stiffness: 70, damping: 18 }}
              className={`flex flex-col ${isOdd ? "md:flex-row-reverse" : "md:flex-row"} gap-8 md:gap-14 items-center`}
            >
              {/* Icon panel */}
              <div className="md:w-2/5 flex justify-center">
                <div
                  className={`relative w-40 h-40 md:w-52 md:h-52 rounded-2xl bg-white border ${beat.accentBorder} shadow-sm flex items-center justify-center`}
                >
                  <Icon
                    size={56}
                    strokeWidth={1.5}
                    style={{ color: beat.accent }}
                  />
                </div>
              </div>

              {/* Copy */}
              <div className="md:w-3/5">
                <p
                  className={`text-[11px] uppercase tracking-[0.3em] font-semibold mb-3 ${beat.accentText}`}
                >
                  {beat.eyebrow}
                </p>
                <h3 className="text-[26px] md:text-[34px] font-bold text-zinc-900 tracking-tight leading-[1.1] mb-4">
                  {beat.title}
                </h3>
                <p className="text-[14px] md:text-[15px] text-zinc-600 leading-relaxed">
                  {beat.body}
                </p>
              </div>
            </motion.div>
          );
        })}

        {/* Pivot line to the CTA */}
        <motion.a
          href="#try-live"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.4 }}
          className="mt-6 flex items-center justify-center gap-2 text-[13px] text-emerald-700 hover:text-emerald-800 font-semibold transition-colors"
        >
          See a live session
          <ArrowRight size={14} />
        </motion.a>
      </div>
    </section>
  );
}

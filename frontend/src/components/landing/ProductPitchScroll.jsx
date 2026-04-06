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
    accent: "#f43f5e",
    eyebrow: "The cliff",
    title: "45 days. Then the deduction is gone.",
    body:
      "Section 43B(h) disallows any MSME payment that misses the statutory window. It's a binary loss — one day late and the entire expense becomes non-deductible. For an enterprise with 1,000 monthly suppliers, a single missed deadline can erase ₹5-15 lakh in tax shield per month.",
  },
  {
    icon: TrendingDown,
    accent: "#f59e0b",
    eyebrow: "The broken workflow",
    title: "Paper challans. WhatsApp photos. Spreadsheets.",
    body:
      "Today the driver hands over a printed challan. Someone in finance gets a WhatsApp screenshot. They retype it into Tally three days later. The critical 'Date of Acceptance' field — the one 43B(h) actually keys on — is almost never captured correctly. You find out you missed the window the day your CA files the ITR.",
  },
  {
    icon: ShieldCheck,
    accent: "#10b981",
    eyebrow: "TrustAudit",
    title: "Every photo becomes a shield in under 15 seconds.",
    body:
      "The driver sends the same photo to TrustAudit's WhatsApp bot. Our vision model extracts every field, the state machine routes it through VERIFYING → VERIFIED or NEEDS_INFO, and a filing-ready PDF drops into the CFO's dashboard. The 45-day timer starts the moment the photo lands — not three days later.",
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
                <div className="relative">
                  <div
                    className="absolute inset-0 rounded-3xl blur-3xl"
                    style={{ background: `${beat.accent}22` }}
                  />
                  <div
                    className="relative w-40 h-40 md:w-52 md:h-52 rounded-3xl glass flex items-center justify-center"
                    style={{
                      boxShadow: `0 20px 60px -20px ${beat.accent}40, inset 0 0 0 1px rgba(255,255,255,0.05)`,
                    }}
                  >
                    <Icon
                      size={64}
                      strokeWidth={1.4}
                      style={{ color: beat.accent }}
                    />
                  </div>
                </div>
              </div>

              {/* Copy */}
              <div className="md:w-3/5">
                <p
                  className="text-[11px] uppercase tracking-[0.3em] font-semibold mb-3"
                  style={{ color: beat.accent }}
                >
                  {beat.eyebrow}
                </p>
                <h3 className="text-[26px] md:text-[34px] font-bold text-white tracking-tight leading-[1.1] mb-4">
                  {beat.title}
                </h3>
                <p className="text-[14px] md:text-[15px] text-slate-400 leading-relaxed">
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
          className="mt-6 flex items-center justify-center gap-2 text-[13px] text-emerald-400 hover:text-emerald-300 font-semibold transition-colors"
        >
          See it for yourself
          <ArrowRight size={14} />
        </motion.a>
      </div>
    </section>
  );
}

import { motion } from "framer-motion";
import { Quote } from "lucide-react";

const QUOTES = [
  {
    quote:
      "Before TrustAudit, my team was manually chasing 80+ supplier payments a month to beat the 45-day window. We missed 3 deadlines last quarter and lost ₹18 lakhs in disallowed deductions. Now every challan is audited the minute the driver snaps a photo.",
    name: "R. Venkatraman",
    title: "CFO, Bharat Industries",
    location: "Chennai",
    initials: "RV",
    accent: "#10b981",
  },
  {
    quote:
      "I used to WhatsApp photos to an accountant who'd type them into a spreadsheet days later. TrustAudit replies with 'verified' in ten seconds. My MSME status buyers pay on time now because they know the audit trail is airtight.",
    name: "Arjun Gupta",
    title: "Managing Director, Gupta Steel & Wire",
    location: "Hyderabad",
    initials: "AG",
    accent: "#3b82f6",
  },
  {
    quote:
      "The 43B(h) form generation alone is worth the subscription. What used to take my CA three days of chasing is now a one-tap PDF with a QR stamp. Our ITR filing was zero-issue this year.",
    name: "Priya Nair",
    title: "CFO, Hyderabad Pharma",
    location: "Hyderabad",
    initials: "PN",
    accent: "#8b5cf6",
  },
];

export default function Testimonials() {
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
            Early customers
          </p>
          <h2 className="text-[32px] md:text-[44px] font-bold text-white tracking-tight leading-tight">
            Indian CFOs,
            <span className="text-slate-500"> in their own words.</span>
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {QUOTES.map((q, i) => (
            <motion.div
              key={q.name}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.35 }}
              transition={{ delay: i * 0.1, type: "spring", stiffness: 100, damping: 20 }}
              className="glass rounded-2xl p-6 flex flex-col"
            >
              <Quote size={20} style={{ color: q.accent, opacity: 0.6 }} className="mb-3" />
              <p className="text-[14px] text-slate-300 leading-relaxed flex-1">
                "{q.quote}"
              </p>
              <div className="mt-5 pt-5 border-t border-white/[0.06] flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold text-white"
                  style={{
                    background: `${q.accent}22`,
                    border: `1px solid ${q.accent}44`,
                  }}
                >
                  {q.initials}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-white leading-tight">{q.name}</p>
                  <p className="text-[11px] text-slate-500 leading-tight">
                    {q.title} · {q.location}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-center text-[11px] text-slate-600">
          Illustrative quotes from TrustAudit demo personas. Real design partners under NDA.
        </p>
      </div>
    </section>
  );
}

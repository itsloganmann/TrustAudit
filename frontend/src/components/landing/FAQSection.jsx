import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "What is Section 43B(h) and why is the 45-day deadline so critical?",
    a: "Section 43B(h) of the Income Tax Act (introduced via the Finance Act 2023) disallows any deduction for a payment to a registered MSME supplier if it is not paid within 15 days (no written agreement) or 45 days (with agreement). The disallowance is binary — one day late and the entire expense becomes non-deductible. For a ₹10 lakh bill at 30% corporate tax that is ₹3 lakhs of shield lost per invoice.",
  },
  {
    q: "How accurate is the OCR? What if the photo is blurry?",
    a: "We use Gemini 2.5 Flash with a structured extraction prompt that returns per-field confidence scores. Fields below 85% confidence are never auto-submitted — the bot replies to the driver on WhatsApp asking for the specific missing or illegible piece. On our 16 fixture benchmarks we see ~96% accuracy on printed challans and ~88% on handwritten ones.",
  },
  {
    q: "Is my supplier data secure? Where is it stored?",
    a: "All uploads are stored in the customer's isolated database partition. We support customer-managed encryption keys on enterprise plans. Audit logs are append-only and exportable. The /live public demo dashboard anonymizes every vendor name and auto-expires rows after 10 minutes.",
  },
  {
    q: "Can I export a compliance report for my ITR filing?",
    a: "Yes. One tap on any verified invoice generates a Section 43B(h) compliance PDF with your company letterhead, the supplier MSME details, all critical dates, the extraction audit trail with confidence scores, and a QR authenticity code that any tax officer can scan. The form is designed to attach directly to Schedule BP.",
  },
  {
    q: "How do I onboard my suppliers? Do they need an app?",
    a: "No app needed. Suppliers and drivers send photos directly to TrustAudit's WhatsApp bot from the phone they already use. We provide a simple onboarding template you can share by WhatsApp — they tap once, send photos, and you see everything on your dashboard in real time.",
  },
  {
    q: "Can multiple people from my finance team use the same account?",
    a: "Yes. TrustAudit supports role-scoped logins: CFO, AP clerk, auditor, and read-only viewer. Each identity can use Google, Facebook, WhatsApp OTP, phone OTP, or an email magic link. All actions are logged to the audit trail so you always know who verified or disputed which invoice.",
  },
];

function FAQItem({ q, a, index, isOpen, onToggle }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={{ delay: index * 0.05, type: "spring", stiffness: 120, damping: 20 }}
      className="glass rounded-xl overflow-hidden"
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left group"
      >
        <span className="text-[14px] md:text-[15px] font-semibold text-white group-hover:text-emerald-300 transition-colors">
          {q}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="flex-shrink-0"
        >
          <ChevronDown size={16} className="text-slate-500" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-0 text-[13px] text-slate-400 leading-relaxed border-t border-white/[0.04]">
              {a}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(0);
  return (
    <section id="faq" className="relative py-20 md:py-28">
      <div className="max-w-4xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.4 }}
          transition={{ type: "spring", stiffness: 90, damping: 20 }}
          className="text-center mb-10"
        >
          <p className="text-[11px] text-emerald-400 uppercase tracking-[0.3em] font-semibold mb-3">
            FAQ
          </p>
          <h2 className="text-[32px] md:text-[40px] font-bold text-white tracking-tight leading-tight">
            Everything a CFO asks
            <span className="text-slate-500"> before the first demo.</span>
          </h2>
        </motion.div>

        <div className="space-y-2.5">
          {FAQS.map((faq, i) => (
            <FAQItem
              key={faq.q}
              q={faq.q}
              a={faq.a}
              index={i}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";

const FAQS = [
  {
    q: "What exactly does TrustAudit do?",
    a: "We help Indian AP teams decide which supplier invoices are safe to pay. Proof of delivery and acceptance arrives through many channels (WhatsApp photos, PDFs, signed PODs, stamped GRNs, email attachments). We ingest it, match it to the right invoice or shipment line, and return one of three verdicts: clear to claim, disputed, or missing proof.",
  },
  {
    q: "Why is the proof-matching problem unsolved today?",
    a: "ERPs assume structured data. Generic OCR tools pull fields out of a single document. Neither of them can look at a stack of scattered evidence, across channels the ERP cannot see, and tell finance whether the trade event actually happened in a way they can trust enough to release money. That decision layer is the gap. Everything else (ingestion, extraction, storage) is in service of it.",
  },
  {
    q: "How is this different from an ERP or a document OCR tool?",
    a: "ERPs are a system of record. OCR tools return fields. Payment platforms move money once someone says to. We do the judgment call in the middle: given this invoice and this pile of proof, should finance release? Our competitors are generic document tools, ERPs trying to grow out of their lane, and manual AP teams. Our differentiator is the decision.",
  },
  {
    q: "How does Section 43B(h) fit in?",
    a: "Section 43B(h) is one named use case that rides on top of the proof layer. The law disallows the buyer's tax deduction if a registered MSME invoice is paid more than 45 days after acceptance. Once we know the acceptance date from the proof we ingested, we can flag invoices approaching the cliff so AP can release them in time. It is one decision among many we help finance make, not the whole product.",
  },
  {
    q: "Who pays and how does pricing work?",
    a: "The enterprise buyer pays. Enterprise SaaS plus a usage fee per invoice processed. Suppliers use TrustAudit for free because we need their proof in the loop. Most pilots start with a team of AP clerks in one sector (pharma distribution, manufacturing, or industrial procurement) and expand from there.",
  },
  {
    q: "How do suppliers onboard? Do they need a new app?",
    a: "No. Suppliers and drivers send proof through the channels they already use: WhatsApp, email, the warehouse stamp they already apply to paperwork. We meet the evidence where it lives. The AP team gets the dashboard; the supplier does nothing new.",
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
        <span className="text-[14px] md:text-[15px] font-semibold text-zinc-900 group-hover:text-emerald-700 transition-colors">
          {q}
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="flex-shrink-0"
        >
          <ChevronDown size={16} className="text-zinc-500" />
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
            <div className="px-5 pb-5 pt-0 text-[13px] text-zinc-600 leading-relaxed border-t border-zinc-200">
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
          <p className="text-[11px] text-emerald-700 uppercase tracking-[0.3em] font-semibold mb-3">
            FAQ
          </p>
          <h2 className="text-[32px] md:text-[40px] font-bold text-zinc-900 tracking-tight leading-tight">
            What AP and finance leads ask
            <span className="text-zinc-500"> before the first pilot.</span>
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

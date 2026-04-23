import { motion } from "framer-motion";
import { Quote } from "lucide-react";

const QUOTES = [
  {
    quote:
      "My clerks were reconciling WhatsApp photos against the ERP by hand. We'd pay invoices we didn't have proof for and chase proof for invoices we'd already paid. Seeing one queue with a verdict attached is the first time the workflow made sense.",
    name: "Head of AP",
    title: "Pharma distributor",
    location: "Hyderabad pilot",
    initials: "AP",
  },
  {
    quote:
      "Proof of delivery exists. It's just scattered. A stamp here, a signed POD there, a GRN in the ERP. Having something pull it all together and tell us whether the invoice is clear, disputed, or still waiting means finance isn't guessing anymore.",
    name: "Finance Controller",
    title: "Process manufacturer",
    location: "Pune pilot",
    initials: "FC",
  },
  {
    quote:
      "We run thousands of supplier invoices a month. The value isn't the AI reading a photo. It's the decision: this one is safe to pay, this one is not. That's the thing we never had and every other tool ignored.",
    name: "VP, Procurement",
    title: "Industrial procurement",
    location: "Mumbai pilot",
    initials: "VP",
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
          <p className="text-[11px] text-emerald-700 uppercase tracking-[0.3em] font-semibold mb-3">
            Early pilot feedback
          </p>
          <h2 className="text-[32px] md:text-[44px] font-bold text-zinc-900 tracking-tight leading-tight">
            What AP teams are telling us
            <span className="text-zinc-500"> in pilot.</span>
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
              <Quote size={20} className="text-emerald-600 mb-3" />
              <p className="text-[14px] text-zinc-700 leading-relaxed flex-1">
                "{q.quote}"
              </p>
              <div className="mt-5 pt-5 border-t border-zinc-200 flex items-center gap-3">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-[12px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200">
                  {q.initials}
                </div>
                <div>
                  <p className="text-[13px] font-semibold text-zinc-900 leading-tight">{q.name}</p>
                  <p className="text-[11px] text-zinc-500 leading-tight">
                    {q.title} · {q.location}
                  </p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-center text-[11px] text-zinc-500">
          Unattributed quotes from early pilot conversations. Pilot partners under NDA.
        </p>
      </div>
    </section>
  );
}

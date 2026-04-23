import { useState } from "react";
import { motion } from "framer-motion";
import {
  Copy,
  Check,
  MessageCircle,
  ArrowRight,
  Sparkles,
  PhoneCall,
} from "lucide-react";
import WhatsAppQRBlock from "./WhatsAppQRBlock";
import {
  WA_LINK,
  WHATSAPP_FIRST_MESSAGE,
  WHATSAPP_NUMBER_DISPLAY as WHATSAPP_NUMBER,
} from "../../config/whatsapp.js";

function CopyButton({ value, label, tone = "emerald" }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      // Silently fail — the raw value is already visible on screen.
    }
  };
  const accent =
    tone === "emerald"
      ? "text-emerald-700 hover:text-emerald-800 border-emerald-200 hover:border-emerald-300 hover:bg-emerald-50"
      : "text-zinc-600 hover:text-zinc-900 border-zinc-200 hover:border-zinc-300 hover:bg-zinc-50";
  return (
    <button
      type="button"
      onClick={handleCopy}
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-medium transition-all ${accent}`}
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      {copied ? "Copied" : label}
    </button>
  );
}

function Step({ number, label }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center bg-zinc-50 border border-zinc-200 text-[13px] font-bold text-zinc-900 tabular-nums">
        {number}
      </div>
      <span className="text-[13px] text-zinc-700 font-medium">{label}</span>
    </div>
  );
}

export default function DemoCTAPanel() {
  return (
    <section id="try-live" className="relative py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ type: "spring", stiffness: 90, damping: 20 }}
          className="relative rounded-2xl overflow-hidden bg-white border border-zinc-200 shadow-sm"
        >
          <div className="relative p-8 md:p-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left: Copy + Steps + Number */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-700 font-semibold tracking-wide mb-5">
                <Sparkles size={12} />
                No login required · 30 seconds
              </div>
              <h2 className="text-[30px] md:text-[42px] font-bold text-zinc-900 leading-[1.05] tracking-tight">
                See a live verdict.
              </h2>
              <p className="mt-4 text-[15px] text-zinc-600 max-w-xl leading-relaxed">
                Send a photo of any delivery challan, POD, or GRN to our
                WhatsApp number. In a few seconds it lands on the public
                dashboard, matched to a test invoice, with a clear-to-claim,
                disputed, or missing-proof verdict attached. No app, no
                login, no typing.
              </p>

              <div className="mt-8 space-y-3.5">
                <Step number="1" label="Tap WhatsApp (or scan the QR on the right)" />
                <Step number="2" label="Send a photo of any delivery proof" />
                <Step number="3" label="Watch /live, the verdict appears in seconds" />
              </div>

              {/* Giant phone number */}
              <div className="mt-8 rounded-xl p-5 border border-zinc-200 bg-zinc-50">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                      <PhoneCall size={16} className="text-emerald-700" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">
                        TrustAudit WhatsApp
                      </p>
                      <p className="text-[26px] md:text-[32px] font-bold tabular-nums text-zinc-900 tracking-tight leading-tight whitespace-nowrap">
                        {WHATSAPP_NUMBER}
                      </p>
                    </div>
                  </div>
                  <CopyButton value={WHATSAPP_NUMBER} label="Copy number" />
                </div>
                <div className="mt-3 pt-3 border-t border-zinc-200 flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-[12px] text-zinc-600">
                    Just say{" "}
                    <code className="px-1.5 py-0.5 rounded bg-white border border-zinc-200 text-emerald-700 font-mono text-[11px]">
                      {WHATSAPP_FIRST_MESSAGE}
                    </code>{" "}
                    then attach any bill photo.
                  </div>
                  <CopyButton value={WHATSAPP_FIRST_MESSAGE} label="Copy" tone="slate" />
                </div>
              </div>

              {/* Primary + Secondary CTAs */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a
                  href={WA_LINK}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn btn-hero btn-primary"
                >
                  <MessageCircle size={16} strokeWidth={2.4} />
                  Open WhatsApp
                </a>
                <a href="/live" className="btn btn-hero btn-ghost">
                  Open AP decision dashboard
                  <ArrowRight size={16} />
                </a>
              </div>
            </div>

            {/* Right: QR */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center">
              <WhatsAppQRBlock waLink={WA_LINK} size={220} />
              <p className="mt-3 text-[11px] text-zinc-500 text-center max-w-[260px]">
                Or tap the number above to open WhatsApp directly on your phone.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

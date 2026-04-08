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
      ? "text-emerald-300 hover:text-emerald-200 border-emerald-500/25 hover:border-emerald-400/50 hover:bg-emerald-500/5"
      : "text-slate-300 hover:text-white border-white/[0.1] hover:border-white/[0.2] hover:bg-white/[0.04]";
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
      <div className="w-8 h-8 rounded-full flex items-center justify-center glass border border-white/[0.1] text-[13px] font-bold text-white tabular-nums">
        {number}
      </div>
      <span className="text-[13px] text-slate-300 font-medium">{label}</span>
    </div>
  );
}

export default function DemoCTAPanel() {
  return (
    <section id="try-live" className="relative py-20 md:py-28">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.35 }}
          transition={{ type: "spring", stiffness: 90, damping: 20 }}
          className="relative glass rounded-3xl overflow-hidden"
          style={{
            boxShadow:
              "0 40px 120px -30px rgba(16,185,129,0.22), 0 0 0 1px rgba(255,255,255,0.04) inset",
          }}
        >
          {/* Ambient glow behind the panel */}
          <div
            className="pointer-events-none absolute -top-40 -left-24 w-[420px] h-[420px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(16,185,129,0.18) 0%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />
          <div
            className="pointer-events-none absolute -bottom-40 -right-24 w-[420px] h-[420px] rounded-full"
            style={{
              background:
                "radial-gradient(circle, rgba(59,130,246,0.15) 0%, transparent 70%)",
              filter: "blur(40px)",
            }}
          />

          <div className="relative p-8 md:p-12 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left: Copy + Steps + Number */}
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 font-semibold tracking-wide mb-5">
                <Sparkles size={12} />
                No login required · 30 seconds
              </div>
              <h2 className="text-[30px] md:text-[42px] font-bold text-white leading-[1.05] tracking-tight">
                Try it right now.
              </h2>
              <p className="mt-4 text-[15px] text-slate-400 max-w-xl leading-relaxed">
                Send a photo of any paper bill to our WhatsApp number from
                your own phone. In under 20 seconds you'll see it land on the
                public dashboard with the vendor, amount and deadline already
                filled in. No app. No login. No typing.
              </p>

              <div className="mt-8 space-y-3.5">
                <Step number="1" label="Tap WhatsApp (or scan the QR on the right)" />
                <Step number="2" label="Send a photo of any paper bill" />
                <Step number="3" label="Watch /live — row appears in under 20 seconds" />
              </div>

              {/* Giant phone number */}
              <div className="mt-8 rounded-2xl p-5 border border-white/[0.08] bg-white/[0.02]">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center flex-shrink-0">
                      <PhoneCall size={16} className="text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
                        TrustAudit WhatsApp
                      </p>
                      <p className="text-[26px] md:text-[32px] font-bold tabular-nums text-white tracking-tight leading-tight whitespace-nowrap">
                        {WHATSAPP_NUMBER}
                      </p>
                    </div>
                  </div>
                  <CopyButton value={WHATSAPP_NUMBER} label="Copy number" />
                </div>
                <div className="mt-3 pt-3 border-t border-white/[0.05] flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-[12px] text-slate-400">
                    Just say{" "}
                    <code className="px-1.5 py-0.5 rounded bg-white/[0.06] text-emerald-300 font-mono text-[11px]">
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
                  className="inline-flex items-center gap-2 px-5 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[14px] tracking-tight transition-all shadow-[0_10px_40px_-10px_rgba(16,185,129,0.6)]"
                >
                  <MessageCircle size={16} strokeWidth={2.4} />
                  Open WhatsApp
                </a>
                <a
                  href="/live"
                  className="inline-flex items-center gap-2 px-5 h-12 rounded-xl glass glass-hover text-white font-semibold text-[14px] tracking-tight transition-all"
                >
                  Open /live dashboard
                  <ArrowRight size={16} />
                </a>
              </div>
            </div>

            {/* Right: QR */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center">
              <WhatsAppQRBlock waLink={WA_LINK} size={220} />
              <p className="mt-3 text-[11px] text-slate-600 text-center max-w-[260px]">
                Or tap the number above to open WhatsApp directly on your phone.
              </p>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

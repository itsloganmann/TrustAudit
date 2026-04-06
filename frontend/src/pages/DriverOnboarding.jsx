import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { MessageCircle, Camera, ArrowRight, CheckCircle2 } from "lucide-react";
import AuthShell from "../components/auth/AuthShell.jsx";

const WHATSAPP_NUMBER_RAW = "14155238886";
const JOIN_CODE = "crop-conversation";
const WA_LINK = `https://wa.me/${WHATSAPP_NUMBER_RAW}?text=${encodeURIComponent(
  `join ${JOIN_CODE}`
)}`;

/**
 * Two-screen post-signup walk-through for drivers.
 *
 * Screen 1: Welcome + WhatsApp number + scannable QR.
 * Screen 2: Confirmation + jump to /driver dashboard.
 */
export default function DriverOnboarding() {
  const [screen, setScreen] = useState(1);
  const navigate = useNavigate();

  return (
    <AuthShell
      role="driver"
      eyebrow={`Step ${screen} of 2`}
      title={
        screen === 1
          ? "Send your first challan via WhatsApp."
          : "You're all set."
      }
      subtitle={
        screen === 1
          ? "Tap the WhatsApp number below or scan the QR code with your phone. Send a challan photo and watch it appear in your dashboard within 15 seconds."
          : "Your enterprise will see every challan you submit. We'll WhatsApp you the moment a payment is approved."
      }
    >
      <AnimatePresence mode="wait">
        {screen === 1 && (
          <motion.div
            key="step-1"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="glass rounded-xl p-5 text-center space-y-4 border border-emerald-500/15 bg-emerald-500/[0.03]">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 font-semibold tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
                WhatsApp number
              </div>
              <p className="text-[28px] font-bold text-white tabular-nums tracking-tight">
                +1 (415) 523-8886
              </p>
              <a
                href={WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[13px] tracking-tight transition-all shadow-[0_8px_32px_-12px_rgba(16,185,129,0.7)]"
              >
                <MessageCircle size={14} />
                Open WhatsApp now
                <ArrowRight size={13} />
              </a>
              <p className="text-[10px] text-slate-500">
                First message:{" "}
                <code className="text-slate-300 font-mono">join {JOIN_CODE}</code>
              </p>
            </div>

            <div className="glass rounded-xl p-5 flex items-center gap-4">
              <div className="bg-white p-2 rounded-lg shrink-0">
                <QRCodeSVG value={WA_LINK} size={88} level="M" />
              </div>
              <div>
                <p className="text-[12px] text-white font-semibold">
                  On a desktop? Scan this.
                </p>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-1">
                  Opens WhatsApp on your phone with the join code pre-filled.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setScreen(2)}
              className="w-full h-11 rounded-xl bg-white hover:bg-slate-100 text-slate-950 text-[13px] font-semibold transition-all flex items-center justify-center gap-2"
            >
              I sent my first photo
              <ArrowRight size={13} />
            </button>
          </motion.div>
        )}

        {screen === 2 && (
          <motion.div
            key="step-2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="space-y-4"
          >
            <div className="glass rounded-xl p-6 text-center space-y-3 border border-emerald-500/15 bg-emerald-500/[0.03]">
              <CheckCircle2 size={56} className="text-emerald-400 mx-auto" strokeWidth={1.5} />
              <p className="text-[15px] text-white font-semibold">
                Your driver account is live.
              </p>
              <p className="text-[12px] text-slate-400 leading-relaxed">
                From now on, every photo you send to{" "}
                <span className="text-white font-medium">+1 415 523 8886</span> will be
                processed automatically. No app to install. No paperwork.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Tip icon={<Camera size={14} />} title="Clear photo" sub="Avoid glare" />
              <Tip icon={<MessageCircle size={14} />} title="One per msg" sub="Easier to read" />
              <Tip icon={<CheckCircle2 size={14} />} title="Get pinged" sub="Status updates" />
            </div>

            <button
              type="button"
              onClick={() => navigate("/driver")}
              className="w-full h-11 rounded-xl bg-white hover:bg-slate-100 text-slate-950 text-[13px] font-semibold transition-all flex items-center justify-center gap-2"
            >
              Go to my dashboard
              <ArrowRight size={13} />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  );
}

function Tip({ icon, title, sub }) {
  return (
    <div className="glass rounded-xl px-3 py-3 text-center">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-white/[0.04] text-emerald-400">
        {icon}
      </span>
      <p className="mt-2 text-[11px] text-white font-semibold leading-tight">{title}</p>
      <p className="text-[10px] text-slate-500 leading-tight">{sub}</p>
    </div>
  );
}

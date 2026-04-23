import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { QRCodeSVG } from "qrcode.react";
import { MessageCircle, Camera, ArrowRight, CheckCircle2 } from "lucide-react";
import AuthShell from "../components/auth/AuthShell.jsx";
import {
  WA_LINK,
  WHATSAPP_FIRST_MESSAGE,
  WHATSAPP_NUMBER_DISPLAY,
} from "../config/whatsapp.js";

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
          ? "Send your first acceptance proof on WhatsApp."
          : "You're all set."
      }
      subtitle={
        screen === 1
          ? "Tap the WhatsApp number below or scan the QR code with your phone. Send a photo of a paper bill and watch the decision appear in under 20 seconds. No app. No login. No typing."
          : "The AP team sees every bill you send. We'll WhatsApp you back the moment the invoice is cleared to claim."
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
            <div className="glass rounded-xl p-5 text-center space-y-4 border-emerald-200 bg-emerald-50">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white border border-emerald-200 text-[11px] text-emerald-700 font-semibold tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
                WhatsApp number
              </div>
              <p className="text-[28px] font-bold text-zinc-900 tabular-nums tracking-tight">
                {WHATSAPP_NUMBER_DISPLAY}
              </p>
              <a
                href={WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary btn-md"
              >
                <MessageCircle size={14} />
                Open WhatsApp now
                <ArrowRight size={13} />
              </a>
              <p className="text-[10px] text-zinc-500">
                First message:{" "}
                <code className="text-zinc-700 font-mono">{WHATSAPP_FIRST_MESSAGE}</code>
              </p>
            </div>

            <div className="glass rounded-xl p-5 flex items-center gap-4">
              <div className="bg-white p-2 rounded-lg shrink-0 border border-zinc-200">
                <QRCodeSVG value={WA_LINK} size={88} level="M" />
              </div>
              <div>
                <p className="text-[12px] text-zinc-900 font-semibold">
                  On a desktop? Scan this.
                </p>
                <p className="text-[11px] text-zinc-500 leading-relaxed mt-1">
                  Opens WhatsApp on your phone with the chat pre-filled.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setScreen(2)}
              className="btn btn-ghost btn-md w-full"
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
            <div className="glass rounded-xl p-6 text-center space-y-3 border-emerald-200 bg-emerald-50">
              <CheckCircle2 size={56} className="text-emerald-700 mx-auto" strokeWidth={1.5} />
              <p className="text-[15px] text-zinc-900 font-semibold">
                Your supplier driver account is live.
              </p>
              <p className="text-[12px] text-zinc-600 leading-relaxed">
                From now on, every photo you send to{" "}
                <span className="text-zinc-900 font-medium">{WHATSAPP_NUMBER_DISPLAY}</span> is
                read automatically in under 20 seconds and the AP team sees the decision. No app to install. No paperwork.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <Tip icon={<Camera size={14} />} title="Clear photo" sub="Avoid glare" />
              <Tip icon={<MessageCircle size={14} />} title="One per msg" sub="Easier to read" />
              <Tip icon={<CheckCircle2 size={14} />} title="Get pinged" sub="Decision updates" />
            </div>

            <button
              type="button"
              onClick={() => navigate("/driver")}
              className="btn btn-primary btn-md w-full"
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
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700">
        {icon}
      </span>
      <p className="mt-2 text-[11px] text-zinc-900 font-semibold leading-tight">{title}</p>
      <p className="text-[10px] text-zinc-500 leading-tight">{sub}</p>
    </div>
  );
}

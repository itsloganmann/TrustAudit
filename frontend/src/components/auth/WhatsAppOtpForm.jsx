import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, ArrowLeft, ShieldCheck } from "lucide-react";
import { sendOtp, verifyOtp } from "../../lib/auth.js";
import { useAuth } from "../../hooks/useAuth.js";

/**
 * Two-step phone-OTP form delivered over WhatsApp.
 *
 * Step 1: enter phone number → POST /auth/otp/whatsapp/send
 * Step 2: enter 6-digit code → POST /auth/otp/whatsapp/verify
 *
 * @param {{ role: "vendor"|"driver", channel?: "whatsapp"|"phone" }} props
 */
export default function WhatsAppOtpForm({ role, channel = "whatsapp" }) {
  const [step, setStep] = useState("phone");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const channelLabel = channel === "whatsapp" ? "WhatsApp" : "SMS";

  const handleSend = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^\+?[1-9]\d{7,14}$/.test(phone.trim())) {
      setError("Enter a valid phone number with country code (e.g. +919876543210)");
      return;
    }
    setBusy(true);
    try {
      await sendOtp(channel, phone.trim(), role);
      setStep("code");
    } catch (err) {
      setError(err.message || "Couldn't send code. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^\d{4,8}$/.test(code.trim())) {
      setError("Enter the code from your message");
      return;
    }
    setBusy(true);
    try {
      await verifyOtp(channel, phone.trim(), code.trim(), role);
      await refresh();
      navigate(role === "vendor" ? "/vendor" : "/driver");
    } catch (err) {
      setError(err.message || "Invalid code. Check and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <AnimatePresence mode="wait">
        {step === "phone" ? (
          <motion.form
            key="phone"
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 8 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleSend}
            className="space-y-3"
          >
            <label className="block">
              <span className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">
                Phone number
              </span>
              <div className="mt-1.5 relative">
                <MessageCircle
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
                />
                <input
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="w-full h-11 pl-9 pr-3 text-[13px] bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-white/[0.18] transition-colors"
                />
              </div>
            </label>
            {error && <FieldError>{error}</FieldError>}
            <button
              type="submit"
              disabled={busy}
              className="w-full h-11 rounded-xl bg-white hover:bg-slate-100 text-slate-950 text-[13px] font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {busy ? "Sending..." : `Send ${channelLabel} code`}
            </button>
          </motion.form>
        ) : (
          <motion.form
            key="code"
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            transition={{ duration: 0.2 }}
            onSubmit={handleVerify}
            className="space-y-3"
          >
            <div className="text-[12px] text-slate-500 leading-relaxed">
              We sent a {channelLabel} code to{" "}
              <span className="text-white font-medium tabular-nums">{phone}</span>.
              Enter it below.
            </div>
            <label className="block">
              <span className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">
                Verification code
              </span>
              <div className="mt-1.5 relative">
                <ShieldCheck
                  size={14}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
                />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={8}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="123456"
                  className="w-full h-11 pl-9 pr-3 text-[15px] tabular-nums tracking-[0.2em] bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-white/[0.18] transition-colors"
                />
              </div>
            </label>
            {error && <FieldError>{error}</FieldError>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setStep("phone");
                  setError("");
                  setCode("");
                }}
                className="h-11 px-4 rounded-xl glass glass-hover text-[12px] text-slate-300 flex items-center gap-1.5"
              >
                <ArrowLeft size={12} />
                Back
              </button>
              <button
                type="submit"
                disabled={busy}
                className="flex-1 h-11 rounded-xl bg-white hover:bg-slate-100 text-slate-950 text-[13px] font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {busy ? "Verifying..." : "Verify and continue"}
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

function FieldError({ children }) {
  return (
    <p className="text-[11px] text-rose-400 flex items-center gap-1.5">
      <span className="w-1 h-1 rounded-full bg-rose-500 pulse-dot" />
      {children}
    </p>
  );
}

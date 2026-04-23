import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, ArrowLeft, CheckCircle2 } from "lucide-react";
import { requestMagicLink } from "../../lib/auth.js";

/**
 * Magic-link form: enter email → backend mails the link → success screen.
 *
 * @param {{ role: "vendor"|"driver" }} props
 */
export default function EmailMagicForm({ role }) {
  const [email, setEmail] = useState("");
  const [step, setStep] = useState("form");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Enter a valid email address");
      return;
    }
    setBusy(true);
    try {
      await requestMagicLink(role, email.trim());
      setStep("sent");
    } catch (err) {
      setError(err.message || "Could not send magic link");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AnimatePresence mode="wait">
      {step === "form" ? (
        <motion.form
          key="form"
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 8 }}
          transition={{ duration: 0.2 }}
          onSubmit={handleSubmit}
          className="space-y-3"
        >
          <label className="block">
            <span className="text-[11px] text-zinc-500 uppercase tracking-widest font-semibold">
              Email address
            </span>
            <div className="mt-1.5 relative">
              <Mail
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400"
              />
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@enterprise.com"
                className="w-full h-11 pl-9 pr-3 text-[13px] bg-white border border-zinc-200 rounded-xl text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-300 transition-colors"
              />
            </div>
          </label>
          {error && (
            <p className="text-[11px] text-red-700 flex items-center gap-1.5">
              <span className="w-1 h-1 rounded-full bg-red-500 pulse-dot" />
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={busy}
            className="btn btn-primary btn-md w-full"
          >
            {busy ? "Sending magic link..." : "Email me a magic link"}
          </button>
        </motion.form>
      ) : (
        <motion.div
          key="sent"
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.25 }}
          className="space-y-4"
        >
          <div className="rounded-xl p-5 border border-emerald-200 bg-emerald-50">
            <div className="flex items-start gap-3">
              <CheckCircle2 size={18} className="text-emerald-700 shrink-0 mt-0.5" />
              <div>
                <p className="text-[14px] text-zinc-900 font-semibold">
                  Check your inbox
                </p>
                <p className="text-[12px] text-zinc-600 mt-1 leading-relaxed">
                  We sent a sign-in link to{" "}
                  <span className="text-zinc-900 font-medium">{email}</span>. Click
                  it on this device and we'll log you in. The link expires in 15
                  minutes.
                </p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setStep("form");
              setEmail("");
            }}
            className="text-[12px] text-zinc-500 hover:text-zinc-900 flex items-center gap-1.5"
          >
            <ArrowLeft size={12} />
            Use a different email
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

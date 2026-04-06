import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, Phone, Mail } from "lucide-react";
import GoogleButton from "./GoogleButton.jsx";
import FacebookButton from "./FacebookButton.jsx";
import WhatsAppOtpForm from "./WhatsAppOtpForm.jsx";
import PhoneOtpForm from "./PhoneOtpForm.jsx";
import EmailMagicForm from "./EmailMagicForm.jsx";

/**
 * Grid of all auth providers above the email+password form.
 *
 * Tapping a provider expands an inline panel for OTP / magic-link flows.
 *
 * @param {{ role: "vendor"|"driver", onError?: (e:Error)=>void }} props
 */
export default function ProviderButtons({ role, onError }) {
  const [open, setOpen] = useState(null);

  const togglePanel = (key) => setOpen((cur) => (cur === key ? null : key));

  return (
    <div className="space-y-3">
      {/* Google + Facebook row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <GoogleButton role={role} onError={onError} />
        <FacebookButton role={role} onError={onError} />
      </div>

      {/* WA / Phone / Email magic row */}
      <div className="grid grid-cols-3 gap-2">
        <ProviderPill
          label="WhatsApp"
          icon={<MessageCircle size={14} />}
          active={open === "whatsapp"}
          onClick={() => togglePanel("whatsapp")}
        />
        <ProviderPill
          label="SMS"
          icon={<Phone size={14} />}
          active={open === "phone"}
          onClick={() => togglePanel("phone")}
        />
        <ProviderPill
          label="Magic link"
          icon={<Mail size={14} />}
          active={open === "magic"}
          onClick={() => togglePanel("magic")}
        />
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key={open}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="glass rounded-xl p-4 mt-1">
              {open === "whatsapp" && <WhatsAppOtpForm role={role} />}
              {open === "phone" && <PhoneOtpForm role={role} />}
              {open === "magic" && <EmailMagicForm role={role} />}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Divider */}
      <div className="flex items-center gap-3 py-1">
        <div className="flex-1 h-px bg-white/[0.06]" />
        <span className="text-[10px] text-slate-600 uppercase tracking-widest font-semibold">
          or with email
        </span>
        <div className="flex-1 h-px bg-white/[0.06]" />
      </div>
    </div>
  );
}

function ProviderPill({ label, icon, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-11 rounded-xl flex items-center justify-center gap-1.5 text-[12px] font-medium transition-all border ${
        active
          ? "bg-white/[0.08] border-white/[0.18] text-white"
          : "glass glass-hover text-slate-300 border-transparent"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

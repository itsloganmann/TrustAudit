import { useState } from "react";
import { Sparkles, ChevronDown, Check } from "lucide-react";

/**
 * Dropdown of seeded demo accounts. Clicking an entry calls `onPick`
 * with `{ email, password }` so the parent form can pre-fill its inputs.
 *
 * @param {object} props
 * @param {"vendor"|"driver"} props.role
 * @param {(creds: { email: string, password: string }) => void} props.onPick
 */
export default function DemoAccountPrefill({ role, onPick }) {
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState(null);

  const accounts =
    role === "vendor"
      ? [
          {
            email: "vendor@bharat.demo",
            password: "demo",
            label: "Bharat Industries — Owner",
            sub: "Full vendor dashboard",
          },
          {
            email: "cfo@bharat.demo",
            password: "demo",
            label: "Bharat Industries — CFO",
            sub: "Approver role",
          },
          {
            email: "admin@bharat.demo",
            password: "demo",
            label: "Bharat Industries — Admin",
            sub: "User management",
          },
          {
            email: "analyst@bharat.demo",
            password: "demo",
            label: "Bharat Industries — Analyst",
            sub: "Read-only analytics",
          },
        ]
      : [
          {
            email: "driver@gupta.demo",
            password: "demo",
            label: "Gupta Steel — Driver",
            sub: "MSME field agent",
          },
          {
            email: "driver@priya.demo",
            password: "demo",
            label: "Priya Logistics — Driver",
            sub: "MSME field agent",
          },
        ];

  const handlePick = (acc) => {
    setPicked(acc.email);
    setOpen(false);
    onPick?.({ email: acc.email, password: acc.password });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-2 px-3.5 h-11 rounded-xl glass glass-hover text-left transition-all"
      >
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-md bg-gradient-to-br from-violet-500/30 to-blue-500/20 border border-white/[0.08] flex items-center justify-center">
            <Sparkles size={11} className="text-violet-300" />
          </div>
          <div>
            <p className="text-[12px] text-white font-semibold leading-tight">
              {picked ? "Demo account loaded" : "Use a demo account"}
            </p>
            <p className="text-[10px] text-slate-500 leading-tight mt-0.5">
              {picked || "Pre-fill credentials in one tap"}
            </p>
          </div>
        </div>
        <ChevronDown
          size={13}
          className={`text-slate-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="absolute z-20 mt-1.5 left-0 right-0 glass rounded-xl border border-white/[0.08] shadow-2xl shadow-slate-950/60 overflow-hidden">
          {accounts.map((acc) => (
            <button
              key={acc.email}
              type="button"
              onClick={() => handlePick(acc)}
              className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-white/[0.04] transition-colors text-left border-b border-white/[0.04] last:border-b-0"
            >
              <div className="min-w-0">
                <p className="text-[12px] text-white font-medium tracking-tight truncate">
                  {acc.label}
                </p>
                <p className="text-[10px] text-slate-500 tabular-nums truncate">
                  {acc.email}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[10px] text-slate-600">{acc.sub}</span>
                {picked === acc.email && (
                  <Check size={12} className="text-emerald-400" />
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

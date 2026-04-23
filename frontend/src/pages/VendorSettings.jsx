import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import { motion } from "framer-motion";
import {
  Settings,
  Save,
  Building2,
  Bell,
  KeyRound,
  Sliders,
} from "lucide-react";
import { api, ApiError } from "../lib/api.js";
import ProviderHealthPanel from "../components/mock/ProviderHealthPanel.jsx";

const SECTIONS = [
  { key: "org", label: "Organization", Icon: Building2 },
  { key: "filing", label: "Decision rules", Icon: Sliders },
  { key: "notifications", label: "Notifications", Icon: Bell },
  { key: "api", label: "API keys", Icon: KeyRound },
];

const DEFAULT_SETTINGS = {
  organization_name: "",
  gstin: "",
  contact_email: "",
  submit_confidence_threshold: 0.85,
  auto_submit: false,
  notify_email: true,
  notify_whatsapp: true,
  notify_sms: false,
};

export default function VendorSettings() {
  const [section, setSection] = useState("org");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await api("/settings");
        if (mounted && res) setSettings({ ...DEFAULT_SETTINGS, ...res });
      } catch {
        /* ignore — leave defaults */
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, []);

  function update(key, value) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api("/settings", { method: "PUT", body: settings });
      toast.success("Settings saved");
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : err?.message || "Failed";
      toast.error("Could not save", { description: message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-zinc-700 font-sans">
      <Toaster position="top-right" theme="light" />

      <header className="border-b border-zinc-200 bg-white sticky top-0 z-30">
        <div className="max-w-[1100px] mx-auto px-6 h-14 flex items-center gap-3">
          <div className="w-7 h-7 rounded-md bg-zinc-50 border border-zinc-200 flex items-center justify-center">
            <Settings size={13} className="text-zinc-500" />
          </div>
          <h1 className="text-[14px] text-zinc-900 font-bold tracking-tight">
            Settings
          </h1>
        </div>
      </header>

      <main className="max-w-[1100px] mx-auto px-6 py-6 grid grid-cols-1 md:grid-cols-4 gap-6">
        {/* Sidebar */}
        <aside className="md:col-span-1">
          <nav className="glass rounded-xl p-2 space-y-1">
            {SECTIONS.map((s) => {
              const Icon = s.Icon;
              const active = section === s.key;
              return (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSection(s.key)}
                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-[12px] font-medium transition-colors ${
                    active
                      ? "bg-zinc-100 text-zinc-900 border border-zinc-200"
                      : "text-zinc-600 hover:text-zinc-900 border border-transparent hover:bg-zinc-50"
                  }`}
                >
                  <Icon size={12} />
                  {s.label}
                </button>
              );
            })}
          </nav>

          <div className="mt-4">
            <ProviderHealthPanel />
          </div>
        </aside>

        {/* Body */}
        <section className="md:col-span-3 space-y-4">
          {loading ? (
            <div className="glass rounded-xl py-16 text-center">
              <div className="w-5 h-5 mx-auto rounded-full border-2 border-white/[0.08] border-t-white animate-spin" />
            </div>
          ) : (
            <>
              {section === "org" && (
                <Card title="Organization">
                  <Field label="Organization name">
                    <input
                      type="text"
                      value={settings.organization_name}
                      onChange={(e) =>
                        update("organization_name", e.target.value)
                      }
                      className={inputCls}
                    />
                  </Field>
                  <Field label="GSTIN">
                    <input
                      type="text"
                      value={settings.gstin}
                      onChange={(e) =>
                        update("gstin", e.target.value.toUpperCase())
                      }
                      className={`${inputCls} font-mono`}
                      placeholder="22AAAAA0000A1Z5"
                    />
                  </Field>
                  <Field label="Contact email">
                    <input
                      type="email"
                      value={settings.contact_email}
                      onChange={(e) => update("contact_email", e.target.value)}
                      className={inputCls}
                    />
                  </Field>
                </Card>
              )}

              {section === "filing" && (
                <Card title="Decision rules">
                  <Field
                    label={`Clear-to-claim confidence threshold (${Math.round(
                      settings.submit_confidence_threshold * 100
                    )}%)`}
                  >
                    <input
                      type="range"
                      min={0.5}
                      max={1}
                      step={0.01}
                      value={settings.submit_confidence_threshold}
                      onChange={(e) =>
                        update(
                          "submit_confidence_threshold",
                          Number(e.target.value)
                        )
                      }
                      className="slider-input w-full"
                      style={{
                        background:
                          "linear-gradient(90deg, #dc2626 0%, #d97706 50%, #059669 100%)",
                      }}
                    />
                  </Field>
                  <Toggle
                    label="Auto-clear high-confidence invoices"
                    description="Mark invoices clear to claim without manual review when confidence is above the threshold."
                    checked={settings.auto_submit}
                    onChange={(v) => update("auto_submit", v)}
                  />
                </Card>
              )}

              {section === "notifications" && (
                <Card title="Notification channels">
                  <Toggle
                    label="Email"
                    description="Daily digest + critical alerts."
                    checked={settings.notify_email}
                    onChange={(v) => update("notify_email", v)}
                  />
                  <Toggle
                    label="WhatsApp"
                    description="Real-time updates when invoice decisions change."
                    checked={settings.notify_whatsapp}
                    onChange={(v) => update("notify_whatsapp", v)}
                  />
                  <Toggle
                    label="SMS"
                    description="Backup channel for closing payment windows only."
                    checked={settings.notify_sms}
                    onChange={(v) => update("notify_sms", v)}
                  />
                </Card>
              )}

              {section === "api" && (
                <Card title="API access">
                  <p className="text-[11px] text-zinc-500">
                    API keys are managed by your AP admin. Contact support to
                    rotate or provision new keys.
                  </p>
                  <div className="rounded-lg bg-zinc-50 border border-zinc-200 p-3 font-mono text-[10px] text-zinc-600">
                    sk-trustaudit-••••••••••••1f8a
                  </div>
                </Card>
              )}

              <div className="flex justify-end">
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.97 }}
                  disabled={saving}
                  onClick={handleSave}
                  className="btn btn-primary btn-md"
                >
                  <Save size={12} />
                  {saving ? "Saving..." : "Save changes"}
                </motion.button>
              </div>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

const inputCls =
  "w-full bg-white border border-zinc-200 rounded-lg px-3 py-2 text-[12px] text-zinc-900 placeholder-zinc-400 focus:outline-none focus:border-zinc-300 transition-colors";

function Card({ title, children }) {
  return (
    <div className="glass rounded-xl overflow-hidden">
      <div className="px-4 py-2.5 border-b border-zinc-200">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">
          {title}
        </p>
      </div>
      <div className="p-4 space-y-4">{children}</div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="block text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">
        {label}
      </span>
      {children}
    </label>
  );
}

function Toggle({ label, description, checked, onChange }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div className="flex-1 min-w-0">
        <p className="text-[12px] text-zinc-900 font-medium">{label}</p>
        {description && (
          <p className="text-[10px] text-zinc-500 mt-0.5 leading-snug">
            {description}
          </p>
        )}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${
          checked ? "bg-emerald-600" : "bg-zinc-200"
        }`}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 500, damping: 30 }}
          className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow-sm ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </button>
    </div>
  );
}

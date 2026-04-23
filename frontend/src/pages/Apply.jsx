import { useState } from "react";
import {
  ArrowLeft,
  Shield,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Home,
} from "lucide-react";

// Single source of truth for the closed enums on the form. Mirrors the
// backend Pydantic literals in schemas.py — keep these in sync if a new
// sector or channel is added.
const AP_VOLUME_TIERS = [
  { value: "<1cr", label: "Under ₹1 crore / year" },
  { value: "1-10cr", label: "₹1 – 10 crore / year" },
  { value: "10-100cr", label: "₹10 – 100 crore / year" },
  { value: "100cr+", label: "₹100 crore+ / year" },
];

const SECTOR_OPTIONS = [
  { value: "pharma", label: "Pharma" },
  { value: "manufacturing", label: "Manufacturing" },
  { value: "industrial", label: "Industrial" },
  { value: "distribution", label: "Distribution" },
  { value: "other", label: "Other" },
];

const PROOF_CHANNEL_OPTIONS = [
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "pdf", label: "PDF" },
  { value: "erp", label: "ERP" },
  { value: "physical", label: "Physical / paper" },
];

const BIGGEST_BLOCKER_MAX = 2000;

const INITIAL_FORM_STATE = {
  company_name: "",
  contact_name: "",
  role: "",
  contact_email: "",
  phone: "",
  ap_volume_tier: "",
  sectors: [],
  proof_channels: [],
  biggest_blocker: "",
};

// Tiny email shape check — keep permissive (server is the source of
// truth via EmailStr) but still catch the most common typos before we
// round-trip to the API.
function isEmailShape(value) {
  if (typeof value !== "string") return false;
  if (value.length < 5 || value.length > 254) return false;
  const at = value.indexOf("@");
  return at > 0 && at < value.length - 3 && value.includes(".", at);
}

function validate(form) {
  const errors = {};
  if (!form.company_name.trim()) errors.company_name = "Company name is required.";
  if (!form.contact_name.trim()) errors.contact_name = "Your name is required.";
  if (!form.role.trim()) errors.role = "Role is required.";
  if (!form.contact_email.trim()) {
    errors.contact_email = "Email is required.";
  } else if (!isEmailShape(form.contact_email.trim())) {
    errors.contact_email = "That email looks off. Please check it.";
  }
  if (!form.ap_volume_tier) errors.ap_volume_tier = "Pick a volume tier.";
  if (!form.sectors.length) errors.sectors = "Pick at least one sector.";
  if (!form.proof_channels.length) {
    errors.proof_channels = "Pick at least one proof channel.";
  }
  const blocker = form.biggest_blocker.trim();
  if (!blocker) {
    errors.biggest_blocker = "Tell us the biggest blocker today.";
  } else if (blocker.length > BIGGEST_BLOCKER_MAX) {
    errors.biggest_blocker = `Keep it under ${BIGGEST_BLOCKER_MAX} characters.`;
  }
  return errors;
}

function FieldLabel({ htmlFor, required, children }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-[12px] font-semibold uppercase tracking-[0.12em] text-zinc-600 mb-2"
    >
      {children}
      {required ? <span className="text-emerald-700 ml-1">*</span> : null}
    </label>
  );
}

function FieldError({ message }) {
  if (!message) return null;
  return (
    <p className="mt-2 text-[12px] text-red-700 flex items-start gap-1.5">
      <AlertCircle size={12} className="mt-[2px] shrink-0" />
      <span>{message}</span>
    </p>
  );
}

function TextInput({ id, value, onChange, placeholder, autoComplete, type = "text", disabled }) {
  return (
    <input
      id={id}
      name={id}
      type={type}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      autoComplete={autoComplete}
      disabled={disabled}
      className="w-full h-11 px-4 rounded-lg bg-white border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 text-[14px] focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors disabled:opacity-60"
    />
  );
}

function SelectInput({ id, value, onChange, children, disabled }) {
  return (
    <select
      id={id}
      name={id}
      value={value}
      onChange={onChange}
      disabled={disabled}
      className="w-full h-11 px-4 rounded-lg bg-white border border-zinc-200 text-zinc-900 text-[14px] focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors disabled:opacity-60"
    >
      {children}
    </select>
  );
}

function MultiSelectChips({ options, selected, onToggle, disabled }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((opt) => {
        const active = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => !disabled && onToggle(opt.value)}
            disabled={disabled}
            aria-pressed={active}
            className={
              "inline-flex items-center gap-1.5 px-3 h-9 rounded-full border text-[13px] font-medium transition-colors " +
              (active
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-white border-zinc-200 text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300")
            }
          >
            {active ? <CheckCircle2 size={12} /> : null}
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function TopBar() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="/" className="flex items-center gap-2">
          <ArrowLeft size={16} className="text-zinc-500" />
          <span className="text-[13px] text-zinc-700">Back to home</span>
        </a>
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center">
            <Shield size={15} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-zinc-900 font-semibold text-[15px] tracking-tight">
            TrustAudit
          </span>
        </a>
      </div>
    </header>
  );
}

function SuccessScreen({ companyName }) {
  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <TopBar />
      <main className="max-w-2xl mx-auto px-6 pt-20 pb-24">
        <div className="rounded-2xl p-8 md:p-10 text-center bg-white border border-zinc-200 shadow-sm">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 mb-6">
            <CheckCircle2 size={28} className="text-emerald-700" strokeWidth={2} />
          </div>
          <h1 className="text-[28px] md:text-[32px] font-bold text-zinc-900 tracking-tight leading-tight">
            Thanks! We'll reach out within 24 hours.
          </h1>
          <p className="mt-4 text-[14px] text-zinc-600 max-w-md mx-auto leading-relaxed">
            {companyName ? (
              <>
                Your pilot request for <span className="text-zinc-900 font-semibold">{companyName}</span> is in
                our queue. Expect an email from the founders with next steps.
              </>
            ) : (
              <>Your pilot request is in our queue. Expect an email from the founders with next steps.</>
            )}
          </p>
          <div className="mt-8 flex flex-wrap gap-3 justify-center">
            <a href="/" className="btn btn-md btn-ghost inline-flex items-center gap-2">
              <Home size={14} />
              <span>Back to home</span>
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function Apply() {
  const [form, setForm] = useState(INITIAL_FORM_STATE);
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);
  const [submittedCompany, setSubmittedCompany] = useState(null);

  if (submittedCompany !== null) {
    return <SuccessScreen companyName={submittedCompany} />;
  }

  const updateField = (key) => (e) => {
    const value = e.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const toggleMulti = (key) => (value) => {
    setForm((prev) => {
      const list = prev[key];
      const next = list.includes(value)
        ? list.filter((v) => v !== value)
        : [...list, value];
      return { ...prev, [key]: next };
    });
    if (fieldErrors[key]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  async function handleSubmit(event) {
    event.preventDefault();
    if (submitting) return;
    setServerError(null);
    const errors = validate(form);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    setSubmitting(true);

    const payload = {
      company_name: form.company_name.trim(),
      contact_name: form.contact_name.trim(),
      role: form.role.trim(),
      contact_email: form.contact_email.trim(),
      phone: form.phone.trim() ? form.phone.trim() : null,
      ap_volume_tier: form.ap_volume_tier,
      sectors: form.sectors,
      proof_channels: form.proof_channels,
      biggest_blocker: form.biggest_blocker.trim(),
    };

    try {
      const response = await fetch("/api/pilot/applications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (response.status === 201) {
        setSubmittedCompany(payload.company_name);
        return;
      }
      // Best-effort error extraction so we show something useful in-line.
      let detail = null;
      try {
        const body = await response.json();
        if (body?.detail) {
          detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
        }
      } catch {
        /* ignore — we'll fall back to the generic message below */
      }
      if (response.status === 429) {
        setServerError(
          detail || "Too many submissions from your network. Try again in an hour.",
        );
      } else if (response.status === 422) {
        setServerError(
          "Some fields didn't pass validation. Double-check your inputs and try again.",
        );
      } else {
        setServerError(
          detail || "We couldn't submit your application. Please try again in a moment.",
        );
      }
    } catch {
      setServerError(
        "Network issue. Your connection dropped before we could submit. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const blockerCharCount = form.biggest_blocker.length;
  const blockerOverLimit = blockerCharCount > BIGGEST_BLOCKER_MAX;

  return (
    <div className="min-h-screen bg-white text-zinc-900">
      <TopBar />
      <main className="max-w-2xl mx-auto px-6 pt-14 pb-24">
        {/* Hero */}
        <div className="mb-10">
          <p className="text-[11px] uppercase tracking-[0.4em] font-semibold text-emerald-700">
            Request a pilot
          </p>
          <h1 className="mt-3 text-[32px] md:text-[40px] font-bold text-zinc-900 tracking-tight leading-[1.1]">
            Bring TrustAudit to your AP team.
          </h1>
          <p className="mt-3 text-[14px] text-zinc-600 leading-relaxed max-w-xl">
            Tell us about your vendor payments. We'll reach out within 24 hours with a tailored pilot plan
            that fits your volume and proof channels.
          </p>
        </div>

        {serverError ? (
          <div
            role="alert"
            className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-start gap-2.5"
          >
            <AlertCircle size={16} className="text-red-700 mt-[2px] shrink-0" />
            <p className="text-[13px] text-red-800 leading-relaxed">{serverError}</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} noValidate className="space-y-6">
          <div>
            <FieldLabel htmlFor="company_name" required>
              Company name
            </FieldLabel>
            <TextInput
              id="company_name"
              value={form.company_name}
              onChange={updateField("company_name")}
              placeholder="Acme Industries Pvt Ltd"
              autoComplete="organization"
              disabled={submitting}
            />
            <FieldError message={fieldErrors.company_name} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <FieldLabel htmlFor="contact_name" required>
                Your name
              </FieldLabel>
              <TextInput
                id="contact_name"
                value={form.contact_name}
                onChange={updateField("contact_name")}
                placeholder="Priya Sharma"
                autoComplete="name"
                disabled={submitting}
              />
              <FieldError message={fieldErrors.contact_name} />
            </div>
            <div>
              <FieldLabel htmlFor="role" required>
                Role
              </FieldLabel>
              <TextInput
                id="role"
                value={form.role}
                onChange={updateField("role")}
                placeholder="Head of AP"
                autoComplete="organization-title"
                disabled={submitting}
              />
              <FieldError message={fieldErrors.role} />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <FieldLabel htmlFor="contact_email" required>
                Work email
              </FieldLabel>
              <TextInput
                id="contact_email"
                type="email"
                value={form.contact_email}
                onChange={updateField("contact_email")}
                placeholder="priya@acme.in"
                autoComplete="email"
                disabled={submitting}
              />
              <FieldError message={fieldErrors.contact_email} />
            </div>
            <div>
              <FieldLabel htmlFor="phone">Phone (optional)</FieldLabel>
              <TextInput
                id="phone"
                type="tel"
                value={form.phone}
                onChange={updateField("phone")}
                placeholder="+91 98765 43210"
                autoComplete="tel"
                disabled={submitting}
              />
              <FieldError message={fieldErrors.phone} />
            </div>
          </div>

          <div>
            <FieldLabel htmlFor="ap_volume_tier" required>
              AP volume tier
            </FieldLabel>
            <SelectInput
              id="ap_volume_tier"
              value={form.ap_volume_tier}
              onChange={updateField("ap_volume_tier")}
              disabled={submitting}
            >
              <option value="" disabled>
                Pick one…
              </option>
              {AP_VOLUME_TIERS.map((tier) => (
                <option key={tier.value} value={tier.value}>
                  {tier.label}
                </option>
              ))}
            </SelectInput>
            <FieldError message={fieldErrors.ap_volume_tier} />
          </div>

          <div>
            <FieldLabel required>Sectors you operate in</FieldLabel>
            <MultiSelectChips
              options={SECTOR_OPTIONS}
              selected={form.sectors}
              onToggle={toggleMulti("sectors")}
              disabled={submitting}
            />
            <FieldError message={fieldErrors.sectors} />
          </div>

          <div>
            <FieldLabel required>
              Where do your vendors send proof of delivery today?
            </FieldLabel>
            <MultiSelectChips
              options={PROOF_CHANNEL_OPTIONS}
              selected={form.proof_channels}
              onToggle={toggleMulti("proof_channels")}
              disabled={submitting}
            />
            <FieldError message={fieldErrors.proof_channels} />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <FieldLabel htmlFor="biggest_blocker" required>
                What is the biggest blocker in your AP workflow today?
              </FieldLabel>
              <span
                className={
                  "text-[11px] font-mono " +
                  (blockerOverLimit ? "text-red-700" : "text-zinc-500")
                }
              >
                {blockerCharCount} / {BIGGEST_BLOCKER_MAX}
              </span>
            </div>
            <textarea
              id="biggest_blocker"
              name="biggest_blocker"
              value={form.biggest_blocker}
              onChange={updateField("biggest_blocker")}
              placeholder="E.g. our vendors send challans over WhatsApp and email with no structure, and it takes 3 days to reconcile..."
              rows={5}
              disabled={submitting}
              className="w-full px-4 py-3 rounded-lg bg-white border border-zinc-200 text-zinc-900 placeholder:text-zinc-400 text-[14px] leading-relaxed focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-colors resize-y disabled:opacity-60"
            />
            <FieldError message={fieldErrors.biggest_blocker} />
          </div>

          <div className="pt-4 flex flex-col-reverse md:flex-row md:items-center md:justify-between gap-4">
            <p className="text-[12px] text-zinc-500 leading-relaxed">
              We only use this to reach out about a pilot. No newsletter, no data sharing.
            </p>
            <button
              type="submit"
              disabled={submitting}
              className="btn btn-hero btn-primary disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Submitting…</span>
                </>
              ) : (
                <span>Request pilot</span>
              )}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}

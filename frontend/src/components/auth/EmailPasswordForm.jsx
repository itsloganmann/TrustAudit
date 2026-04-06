import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useNavigate } from "react-router-dom";
import { Mail, Lock, User } from "lucide-react";
import { signupPassword, signinPassword } from "../../lib/auth.js";
import { useAuth } from "../../hooks/useAuth.js";
import { ApiError } from "../../lib/api.js";

const passwordRule = z
  .string()
  .min(4, "Password must be at least 4 characters");

const signinSchema = z.object({
  email: z.string().email("Enter a valid email address"),
  password: passwordRule,
});

const signupSchema = z.object({
  full_name: z.string().min(2, "Tell us your name"),
  email: z.string().email("Enter a valid email address"),
  password: passwordRule,
});

/**
 * Email + password form for both signin and signup flows.
 *
 * @param {object} props
 * @param {"vendor"|"driver"} props.role
 * @param {"signin"|"signup"} props.mode
 * @param {(user:any)=>void} [props.onSuccess]
 * @param {{ email?: string, password?: string }} [props.defaultValues]
 */
export default function EmailPasswordForm({
  role,
  mode,
  onSuccess,
  defaultValues = {},
}) {
  const isSignup = mode === "signup";
  const schema = isSignup ? signupSchema : signinSchema;
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [serverError, setServerError] = useState(null);
  const [roleMismatch, setRoleMismatch] = useState(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm({
    resolver: zodResolver(schema),
    defaultValues,
  });

  // Sync controlled defaults from prefill (e.g. demo-account dropdown)
  // into the form fields whenever the parent passes new values.
  const stamp = `${defaultValues.email || ""}::${defaultValues.password || ""}::${defaultValues.full_name || ""}`;
  useEffect(() => {
    if (defaultValues.email || defaultValues.password || defaultValues.full_name) {
      reset({ ...defaultValues });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);

  const onSubmit = async (values) => {
    setServerError(null);
    setRoleMismatch(null);
    try {
      const res = isSignup
        ? await signupPassword(role, values)
        : await signinPassword(role, values);
      await refresh();
      onSuccess?.(res?.user);
      navigate(role === "vendor" ? "/vendor" : "/driver");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403 && err.body?.role) {
        setRoleMismatch(err.body.role);
        return;
      }
      if (
        err instanceof ApiError &&
        typeof err.body?.detail === "string" &&
        /role/i.test(err.body.detail)
      ) {
        // Best-effort fallback when backend returns role error as string.
        const otherRole = role === "vendor" ? "driver" : "vendor";
        setRoleMismatch(otherRole);
        return;
      }
      setServerError(err.message || "Something went wrong, try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
      {isSignup && (
        <Field
          icon={<User size={14} />}
          label="Full name"
          error={errors.full_name?.message}
        >
          <input
            type="text"
            autoComplete="name"
            placeholder="Priya Sharma"
            {...register("full_name")}
            className="w-full h-11 pl-9 pr-3 text-[13px] bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-white/[0.18] transition-colors"
          />
        </Field>
      )}

      <Field
        icon={<Mail size={14} />}
        label="Email"
        error={errors.email?.message}
      >
        <input
          type="email"
          autoComplete="email"
          placeholder={role === "vendor" ? "cfo@enterprise.com" : "driver@msme.com"}
          {...register("email")}
          className="w-full h-11 pl-9 pr-3 text-[13px] bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-white/[0.18] transition-colors"
        />
      </Field>

      <Field
        icon={<Lock size={14} />}
        label="Password"
        error={errors.password?.message}
      >
        <input
          type="password"
          autoComplete={isSignup ? "new-password" : "current-password"}
          placeholder="••••••••"
          {...register("password")}
          className="w-full h-11 pl-9 pr-3 text-[13px] bg-white/[0.03] border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-white/[0.18] transition-colors"
        />
      </Field>

      {roleMismatch && (
        <div className="glass rounded-xl p-3 border border-amber-500/15 bg-amber-500/[0.04]">
          <p className="text-[12px] text-amber-300 font-semibold">
            Wrong sign-in page
          </p>
          <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">
            You registered as a{" "}
            <span className="text-white font-medium">{roleMismatch}</span>. Use the{" "}
            {roleMismatch} sign-in page instead.
          </p>
          <button
            type="button"
            onClick={() => navigate(`/auth/${roleMismatch}/signin`)}
            className="mt-2 h-8 px-3 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[11px] font-semibold text-amber-200 hover:bg-amber-500/25 transition"
          >
            Go to {roleMismatch} sign-in →
          </button>
        </div>
      )}

      {serverError && !roleMismatch && (
        <p className="text-[11px] text-rose-400 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-rose-500 pulse-dot" />
          {serverError}
        </p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full h-11 rounded-xl bg-white hover:bg-slate-100 text-slate-950 text-[13px] font-semibold transition-all disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {isSubmitting
          ? isSignup
            ? "Creating account..."
            : "Signing in..."
          : isSignup
            ? "Create account"
            : "Sign in"}
      </button>
    </form>
  );
}

function Field({ icon, label, error, children }) {
  return (
    <label className="block">
      <span className="text-[11px] text-slate-500 uppercase tracking-widest font-semibold">
        {label}
      </span>
      <div className="mt-1.5 relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600">
          {icon}
        </span>
        {children}
      </div>
      {error && (
        <p className="mt-1.5 text-[11px] text-rose-400 flex items-center gap-1.5">
          <span className="w-1 h-1 rounded-full bg-rose-500 pulse-dot" />
          {error}
        </p>
      )}
    </label>
  );
}

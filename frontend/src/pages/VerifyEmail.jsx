import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import AuthShell from "../components/auth/AuthShell.jsx";
import { verifyEmail } from "../lib/auth.js";
import { useAuth } from "../hooks/useAuth.js";

export default function VerifyEmail() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    let cancelled = false;

    if (!token) {
      setStatus("error");
      setError("Missing verification token");
      return;
    }

    (async () => {
      try {
        const res = await verifyEmail(token);
        if (cancelled) return;
        const next = res?.user || null;
        setUser(next);
        setStatus("success");
        await refresh();

        // Auto-redirect after a short pause so the user sees the success state.
        setTimeout(() => {
          if (cancelled) return;
          if (next?.role === "vendor") navigate("/vendor");
          else if (next?.role === "driver") navigate("/driver");
          else navigate("/auth/vendor/signin");
        }, 1800);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err.message || "Verification failed");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <AuthShell
      role={user?.role === "driver" ? "driver" : "vendor"}
      eyebrow="Email verification"
      title={
        status === "success"
          ? "Email verified."
          : status === "error"
            ? "We couldn't verify that link."
            : "Verifying your email..."
      }
      subtitle={
        status === "success"
          ? "Welcome aboard. Taking you to your dashboard."
          : status === "error"
            ? "The link may be expired or already used. Request a new one from the sign-in page."
            : "Hang tight, this only takes a second."
      }
    >
      <div className="flex items-center justify-center py-6">
        {status === "loading" && (
          <Loader2 size={36} className="text-slate-400 animate-spin" />
        )}
        {status === "success" && (
          <CheckCircle2 size={48} className="text-emerald-400" strokeWidth={1.5} />
        )}
        {status === "error" && (
          <AlertCircle size={48} className="text-rose-400" strokeWidth={1.5} />
        )}
      </div>

      {status === "error" && (
        <>
          <p className="text-[12px] text-rose-400 text-center">{error}</p>
          <div className="grid grid-cols-2 gap-2">
            <Link
              to="/auth/vendor/signin"
              className="h-11 rounded-xl glass glass-hover text-[12px] text-white font-semibold flex items-center justify-center"
            >
              Vendor sign-in
            </Link>
            <Link
              to="/auth/driver/signin"
              className="h-11 rounded-xl glass glass-hover text-[12px] text-white font-semibold flex items-center justify-center"
            >
              Driver sign-in
            </Link>
          </div>
        </>
      )}
    </AuthShell>
  );
}

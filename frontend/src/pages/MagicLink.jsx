import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import AuthShell from "../components/auth/AuthShell.jsx";
import { consumeMagicLink } from "../lib/auth.js";
import { useAuth } from "../hooks/useAuth.js";

export default function MagicLink() {
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
      setError("Missing magic-link token");
      return;
    }

    (async () => {
      try {
        const res = await consumeMagicLink(token);
        if (cancelled) return;
        const next = res?.user || null;
        setUser(next);
        setStatus("success");
        await refresh();
        setTimeout(() => {
          if (cancelled) return;
          if (next?.role === "driver") navigate("/driver");
          else navigate("/vendor");
        }, 1500);
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        setError(err.message || "That magic link is no longer valid");
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
      eyebrow="Magic sign-in"
      title={
        status === "success"
          ? "You're in."
          : status === "error"
            ? "Link expired"
            : "Signing you in..."
      }
      subtitle={
        status === "success"
          ? "Redirecting you to your dashboard now."
          : status === "error"
            ? "Magic links expire after 15 minutes for security. Request a new one."
            : "Hold tight, this takes a second."
      }
    >
      <div className="flex items-center justify-center py-6">
        {status === "loading" && (
          <Loader2 size={36} className="text-zinc-500 animate-spin" />
        )}
        {status === "success" && (
          <CheckCircle2 size={48} className="text-emerald-600" strokeWidth={1.5} />
        )}
        {status === "error" && (
          <AlertCircle size={48} className="text-red-600" strokeWidth={1.5} />
        )}
      </div>

      {status === "error" && (
        <>
          <p className="text-[12px] text-red-700 text-center">{error}</p>
          <Link
            to="/auth/vendor/signin"
            className="btn btn-primary btn-md w-full"
          >
            Request a new link
          </Link>
        </>
      )}
    </AuthShell>
  );
}

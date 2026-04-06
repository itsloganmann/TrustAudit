import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Globe } from "lucide-react";
import { signinGoogle } from "../../lib/auth.js";
import { useAuth } from "../../hooks/useAuth.js";

const SCRIPT_ID = "gsi-script";
const SCRIPT_SRC = "https://accounts.google.com/gsi/client";

/**
 * Google sign-in button using Google Identity Services.
 *
 * Behavior:
 *   - If `VITE_GOOGLE_OAUTH_CLIENT_ID` is set at build time, the GSI script
 *     is loaded once globally and the official rendered button is mounted
 *     into our placeholder div.
 *   - Otherwise we render a fully-styled fallback button that's disabled
 *     and shows a tooltip explaining the missing client ID.
 *
 * @param {object} props
 * @param {"vendor"|"driver"} props.role
 * @param {(err:Error)=>void} [props.onError]
 */
export default function GoogleButton({ role, onError }) {
  const buttonRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const clientId = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
  const enabled = Boolean(clientId);

  useEffect(() => {
    if (!enabled) return undefined;

    let cancelled = false;

    const init = () => {
      if (cancelled) return;
      const google = window.google;
      if (!google?.accounts?.id || !buttonRef.current) {
        // Retry once on next tick — script may still be parsing.
        setTimeout(init, 80);
        return;
      }
      try {
        google.accounts.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            if (!credential) return;
            setBusy(true);
            try {
              await signinGoogle(credential, role);
              await refresh();
              navigate(role === "vendor" ? "/vendor" : "/driver");
            } catch (err) {
              onError?.(err);
            } finally {
              setBusy(false);
            }
          },
        });
        google.accounts.id.renderButton(buttonRef.current, {
          theme: "filled_black",
          size: "large",
          width: 320,
          shape: "pill",
          text: role === "vendor" ? "continue_with" : "signin_with",
        });
        setReady(true);
      } catch (err) {
        onError?.(err);
      }
    };

    const existing = document.getElementById(SCRIPT_ID);
    if (existing) {
      init();
    } else {
      const s = document.createElement("script");
      s.id = SCRIPT_ID;
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      s.onload = init;
      s.onerror = () => onError?.(new Error("Failed to load Google Identity Services"));
      document.body.appendChild(s);
    }

    return () => {
      cancelled = true;
    };
    // role is the only dynamic input
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role, enabled, clientId]);

  if (!enabled) {
    return (
      <button
        type="button"
        disabled
        title="Google sign-in not configured (set VITE_GOOGLE_OAUTH_CLIENT_ID)"
        className="w-full h-11 rounded-xl glass flex items-center justify-center gap-2.5 text-[13px] font-medium text-slate-500 cursor-not-allowed opacity-60"
      >
        <Globe size={15} />
        Continue with Google
        <span className="text-[10px] text-slate-600">(coming soon)</span>
      </button>
    );
  }

  return (
    <div className="relative">
      {/* GSI placeholder — Google injects an iframe here */}
      <div
        ref={buttonRef}
        className={`flex justify-center min-h-[44px] ${ready ? "" : "opacity-0"}`}
      />
      {!ready && (
        <div className="absolute inset-0 h-11 rounded-xl glass flex items-center justify-center gap-2.5 text-[13px] font-medium text-slate-400 pointer-events-none">
          <Globe size={15} />
          Loading Google sign-in...
        </div>
      )}
      {busy && (
        <div className="absolute inset-0 h-11 rounded-xl bg-slate-950/70 flex items-center justify-center text-[12px] text-slate-300">
          Signing in...
        </div>
      )}
    </div>
  );
}

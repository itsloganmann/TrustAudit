import { Facebook } from "lucide-react";

/**
 * Facebook sign-in button.
 *
 * For now this is always disabled with a "Coming soon" tooltip unless the
 * page injects `window.TRUSTAUDIT_FACEBOOK_APP_ID` at runtime. The full
 * Facebook Login JS SDK flow is out of scope for the demo loop because the
 * Meta app review pipeline can't be deterministically completed inside the
 * fleet window.
 */
export default function FacebookButton({ role, onError }) {
  const enabled =
    typeof window !== "undefined" && Boolean(window.TRUSTAUDIT_FACEBOOK_APP_ID);

  const handleClick = () => {
    if (!enabled) return;
    onError?.(
      new Error(
        "Facebook Login SDK integration is wired but disabled in the demo. Set TRUSTAUDIT_FACEBOOK_APP_ID to enable."
      )
    );
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!enabled}
      title={
        enabled
          ? "Continue with Facebook"
          : "Facebook sign-in is coming soon. Use Google or email for now."
      }
      aria-label={`Continue with Facebook as ${role}`}
      className={`w-full h-11 rounded-xl glass flex items-center justify-center gap-2.5 text-[13px] font-medium transition-all ${
        enabled
          ? "text-white glass-hover"
          : "text-slate-500 cursor-not-allowed opacity-60"
      }`}
    >
      <Facebook size={15} />
      Continue with Facebook
      {!enabled && (
        <span className="text-[10px] text-slate-600">(coming soon)</span>
      )}
    </button>
  );
}

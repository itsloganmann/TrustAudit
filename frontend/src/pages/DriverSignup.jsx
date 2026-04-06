import { Link } from "react-router-dom";
import { toast } from "sonner";
import AuthShell from "../components/auth/AuthShell.jsx";
import ProviderButtons from "../components/auth/ProviderButtons.jsx";
import EmailPasswordForm from "../components/auth/EmailPasswordForm.jsx";
import RoleSwitcher from "../components/auth/RoleSwitcher.jsx";

export default function DriverSignup() {
  return (
    <AuthShell
      role="driver"
      eyebrow="Supplier signup"
      title="Get paid faster. Stay compliant."
      subtitle="Sign up in 30 seconds. Then send a challan photo on WhatsApp — that's it. Your enterprise sees it instantly."
      footer={
        <div className="space-y-3">
          <RoleSwitcher currentRole="driver" mode="signup" />
          <p className="text-center text-[12px] text-slate-500">
            Already registered?{" "}
            <Link
              to="/auth/driver/signin"
              className="text-white font-medium hover:text-amber-300 transition-colors"
            >
              Sign in →
            </Link>
          </p>
        </div>
      }
    >
      <ProviderButtons role="driver" onError={(e) => toast.error(e.message)} />
      <EmailPasswordForm role="driver" mode="signup" />
      <p className="text-[10px] text-slate-600 text-center leading-relaxed">
        By signing up you agree to receive WhatsApp messages from
        TrustAudit on the verified number.
      </p>
    </AuthShell>
  );
}

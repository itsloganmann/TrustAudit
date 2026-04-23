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
      eyebrow="Supplier driver signup"
      title="Get your supplier paid faster."
      subtitle="Sign up in 30 seconds. Send a challan photo on WhatsApp. The AP team sees the decision the same minute."
      footer={
        <div className="space-y-3">
          <RoleSwitcher currentRole="driver" mode="signup" />
          <p className="text-center text-[12px] text-zinc-600">
            Already registered?{" "}
            <Link
              to="/auth/driver/signin"
              className="text-emerald-700 font-medium hover:text-emerald-800 transition-colors"
            >
              Sign in →
            </Link>
          </p>
        </div>
      }
    >
      <ProviderButtons role="driver" onError={(e) => toast.error(e.message)} />
      <EmailPasswordForm role="driver" mode="signup" />
      <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
        By signing up you agree to receive WhatsApp messages from
        TrustAudit on the verified number.
      </p>
    </AuthShell>
  );
}

import { Link } from "react-router-dom";
import { toast } from "sonner";
import AuthShell from "../components/auth/AuthShell.jsx";
import ProviderButtons from "../components/auth/ProviderButtons.jsx";
import EmailPasswordForm from "../components/auth/EmailPasswordForm.jsx";
import RoleSwitcher from "../components/auth/RoleSwitcher.jsx";

export default function VendorSignup() {
  return (
    <AuthShell
      role="vendor"
      eyebrow="Enterprise signup"
      title="Protect every ₹ of your 43B(h) deductions."
      subtitle="Two minutes to set up. Connect your suppliers, invite your drivers, and watch your compliance shield go live."
      footer={
        <div className="space-y-3">
          <RoleSwitcher currentRole="vendor" mode="signup" />
          <p className="text-center text-[12px] text-slate-500">
            Already have an account?{" "}
            <Link
              to="/auth/vendor/signin"
              className="text-white font-medium hover:text-emerald-300 transition-colors"
            >
              Sign in →
            </Link>
          </p>
        </div>
      }
    >
      <ProviderButtons role="vendor" onError={(e) => toast.error(e.message)} />
      <EmailPasswordForm role="vendor" mode="signup" />
      <p className="text-[10px] text-slate-600 text-center leading-relaxed">
        By creating an account you agree to our terms and privacy policy.
        We'll never share your invoice data with third parties.
      </p>
    </AuthShell>
  );
}

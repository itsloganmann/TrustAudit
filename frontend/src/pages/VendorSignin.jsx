import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import AuthShell from "../components/auth/AuthShell.jsx";
import ProviderButtons from "../components/auth/ProviderButtons.jsx";
import EmailPasswordForm from "../components/auth/EmailPasswordForm.jsx";
import DemoAccountPrefill from "../components/auth/DemoAccountPrefill.jsx";
import RoleSwitcher from "../components/auth/RoleSwitcher.jsx";

export default function VendorSignin() {
  const [prefill, setPrefill] = useState({});

  return (
    <AuthShell
      role="vendor"
      eyebrow="AP team sign-in"
      title="Welcome back."
      subtitle="Sign in to see which supplier invoices are cleared to claim, disputed, or still missing proof."
      footer={
        <div className="space-y-3">
          <RoleSwitcher currentRole="vendor" mode="signin" />
          <p className="text-center text-[12px] text-zinc-600">
            New to TrustAudit?{" "}
            <Link
              to="/auth/vendor/signup"
              className="text-emerald-700 font-medium hover:text-emerald-800 transition-colors"
            >
              Create an AP team account →
            </Link>
          </p>
        </div>
      }
    >
      <DemoAccountPrefill role="vendor" onPick={setPrefill} />
      <ProviderButtons role="vendor" onError={(e) => toast.error(e.message)} />
      <EmailPasswordForm role="vendor" mode="signin" defaultValues={prefill} />
    </AuthShell>
  );
}

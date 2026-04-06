import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import AuthShell from "../components/auth/AuthShell.jsx";
import ProviderButtons from "../components/auth/ProviderButtons.jsx";
import EmailPasswordForm from "../components/auth/EmailPasswordForm.jsx";
import DemoAccountPrefill from "../components/auth/DemoAccountPrefill.jsx";
import RoleSwitcher from "../components/auth/RoleSwitcher.jsx";

export default function DriverSignin() {
  const [prefill, setPrefill] = useState({});

  return (
    <AuthShell
      role="driver"
      eyebrow="Supplier sign-in"
      title="Namaste! Welcome back."
      subtitle="Sign in to see your past challan submissions and the verification status from each enterprise you supply."
      footer={
        <div className="space-y-3">
          <RoleSwitcher currentRole="driver" mode="signin" />
          <p className="text-center text-[12px] text-slate-500">
            First time here?{" "}
            <Link
              to="/auth/driver/signup"
              className="text-white font-medium hover:text-amber-300 transition-colors"
            >
              Create a supplier account →
            </Link>
          </p>
        </div>
      }
    >
      <DemoAccountPrefill role="driver" onPick={setPrefill} />
      <ProviderButtons role="driver" onError={(e) => toast.error(e.message)} />
      <EmailPasswordForm role="driver" mode="signin" defaultValues={prefill} />
    </AuthShell>
  );
}

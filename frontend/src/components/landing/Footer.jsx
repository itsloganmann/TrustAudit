import { Shield, Github, Mail, Scale } from "lucide-react";
import { Link } from "react-router-dom";
import LEGAL from "../../config/legal.js";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-white/[0.06] bg-slate-950/60 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          {/* Brand */}
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
                <Shield size={13} className="text-slate-950" strokeWidth={2.5} />
              </div>
              <span className="text-white font-semibold text-[14px] tracking-tight">
                {LEGAL.companyName}
              </span>
              <span className="text-[9px] text-slate-500 font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08]">
                43B(h)
              </span>
            </div>
            <p className="text-[12px] text-slate-500 leading-relaxed">
              Real-time Section 43B(h) compliance for Indian MSME payments —
              from a paper bill on WhatsApp to your CFO dashboard in under
              20 seconds.
            </p>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-3">
                Product
              </p>
              <ul className="space-y-2 text-[12px] text-slate-400">
                <li>
                  <a href="#how-it-works" className="hover:text-white transition-colors">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="#try-live" className="hover:text-white transition-colors">
                    Try it now
                  </a>
                </li>
                <li>
                  <Link to="/live" className="hover:text-white transition-colors">
                    /live dashboard
                  </Link>
                </li>
                <li>
                  <a href="#faq" className="hover:text-white transition-colors">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-3">
                Account
              </p>
              <ul className="space-y-2 text-[12px] text-slate-400">
                <li>
                  <Link to="/about" className="hover:text-white transition-colors">
                    About the team
                  </Link>
                </li>
                <li>
                  <Link to="/auth/vendor/signin" className="hover:text-white transition-colors">
                    Vendor sign-in
                  </Link>
                </li>
                <li>
                  <Link to="/auth/vendor/signup" className="hover:text-white transition-colors">
                    Get started
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-3">
                Legal
              </p>
              <ul className="space-y-2 text-[12px] text-slate-400">
                <li>
                  <Link to="/privacy" className="hover:text-white transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-white transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <a
                    href={`mailto:${LEGAL.grievanceOfficerEmail}`}
                    className="hover:text-white transition-colors inline-flex items-center gap-1.5"
                    title="Grievance Officer (DPDP Act Rule 5(9))"
                  >
                    <Scale size={11} />
                    Grievance Officer
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold mb-3">
                Contact
              </p>
              <ul className="space-y-2 text-[12px] text-slate-400">
                <li>
                  <a
                    href={`mailto:${LEGAL.supportEmail}`}
                    className="hover:text-white transition-colors inline-flex items-center gap-1.5"
                  >
                    <Mail size={11} />
                    {LEGAL.supportEmail}
                  </a>
                </li>
                <li>
                  <a
                    href="https://github.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-white transition-colors inline-flex items-center gap-1.5"
                  >
                    <Github size={11} />
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-white/[0.04] flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-[11px] text-slate-600">
          <p>
            © {year} {LEGAL.companyLegalName}. Made in India for Indian MSMEs.
          </p>
          <p className="italic">
            TrustAudit surfaces deadlines and reads AI-extracted fields. It is
            not a substitute for professional tax or legal advice.
          </p>
        </div>
      </div>
    </footer>
  );
}

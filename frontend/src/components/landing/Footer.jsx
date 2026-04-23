import { Shield, Github, Mail, Scale } from "lucide-react";
import { Link } from "react-router-dom";
import LEGAL from "../../config/legal.js";

export default function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="relative border-t border-zinc-200 bg-white">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-8">
          {/* Brand */}
          <div className="max-w-sm">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 rounded-lg bg-zinc-900 flex items-center justify-center">
                <Shield size={13} className="text-white" strokeWidth={2.5} />
              </div>
              <span className="text-zinc-900 font-semibold text-[14px] tracking-tight">
                {LEGAL.companyName}
              </span>
              <span className="text-[9px] text-zinc-600 font-semibold px-1.5 py-0.5 rounded-md bg-zinc-50 border border-zinc-200">
                AP decisions
              </span>
            </div>
            <p className="text-[12px] text-zinc-600 leading-relaxed">
              The decision layer for invoice acceptance. We ingest delivery
              and acceptance proof, match it to the right invoice, and tell
              Indian AP teams whether it is clear to claim, disputed, or
              still missing proof.
            </p>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-8">
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-3">
                Product
              </p>
              <ul className="space-y-2 text-[12px] text-zinc-600">
                <li>
                  <a href="#how-it-works" className="hover:text-zinc-900 transition-colors">
                    How it works
                  </a>
                </li>
                <li>
                  <a href="#try-live" className="hover:text-zinc-900 transition-colors">
                    Try it now
                  </a>
                </li>
                <li>
                  <Link to="/live" className="hover:text-zinc-900 transition-colors">
                    AP decision dashboard
                  </Link>
                </li>
                <li>
                  <a href="#faq" className="hover:text-zinc-900 transition-colors">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-3">
                Account
              </p>
              <ul className="space-y-2 text-[12px] text-zinc-600">
                <li>
                  <Link to="/about" className="hover:text-zinc-900 transition-colors">
                    About the team
                  </Link>
                </li>
                <li>
                  <Link to="/apply" className="hover:text-zinc-900 transition-colors">
                    Request a pilot
                  </Link>
                </li>
                <li>
                  <Link to="/auth/vendor/signin" className="hover:text-zinc-900 transition-colors">
                    Buyer sign-in
                  </Link>
                </li>
                <li>
                  <Link to="/auth/vendor/signup" className="hover:text-zinc-900 transition-colors">
                    Sign up as a buyer
                  </Link>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-3">
                Legal
              </p>
              <ul className="space-y-2 text-[12px] text-zinc-600">
                <li>
                  <Link to="/privacy" className="hover:text-zinc-900 transition-colors">
                    Privacy Policy
                  </Link>
                </li>
                <li>
                  <Link to="/terms" className="hover:text-zinc-900 transition-colors">
                    Terms of Service
                  </Link>
                </li>
                <li>
                  <a
                    href={`mailto:${LEGAL.grievanceOfficerEmail}`}
                    className="hover:text-zinc-900 transition-colors inline-flex items-center gap-1.5"
                    title="Grievance Officer (DPDP Act Rule 5(9))"
                  >
                    <Scale size={11} />
                    Grievance Officer
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold mb-3">
                Contact
              </p>
              <ul className="space-y-2 text-[12px] text-zinc-600">
                <li>
                  <a
                    href={`mailto:${LEGAL.supportEmail}`}
                    className="hover:text-zinc-900 transition-colors inline-flex items-center gap-1.5"
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
                    className="hover:text-zinc-900 transition-colors inline-flex items-center gap-1.5"
                  >
                    <Github size={11} />
                    GitHub
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 pt-6 border-t border-zinc-200 flex flex-col md:flex-row md:items-center md:justify-between gap-3 text-[11px] text-zinc-500">
          <p>
            © {year} {LEGAL.companyLegalName}. Built for AP teams at Indian
            enterprises.
          </p>
          <p className="italic">
            TrustAudit reads AI-extracted fields and returns proof-matching
            verdicts. It is not a substitute for professional tax or legal
            advice.
          </p>
        </div>
      </div>
    </footer>
  );
}

import { Shield, Github, Mail } from "lucide-react";

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
                TrustAudit
              </span>
              <span className="text-[9px] text-slate-500 font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08]">
                43B(h)
              </span>
            </div>
            <p className="text-[12px] text-slate-500 leading-relaxed">
              Real-time Section 43B(h) compliance for Indian MSME payments —
              from WhatsApp to ITR in under 15 seconds.
            </p>
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-8">
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
                    Try live demo
                  </a>
                </li>
                <li>
                  <a href="/live" className="hover:text-white transition-colors">
                    /live dashboard
                  </a>
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
                Resources
              </p>
              <ul className="space-y-2 text-[12px] text-slate-400">
                <li>
                  <a href="/help/demo" className="hover:text-white transition-colors">
                    Demo walkthrough
                  </a>
                </li>
                <li>
                  <a href="/auth/vendor/signin" className="hover:text-white transition-colors">
                    Vendor sign-in
                  </a>
                </li>
                <li>
                  <a href="/auth/vendor/signup" className="hover:text-white transition-colors">
                    Get started
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
                    href="mailto:contact@trustaudit.example"
                    className="hover:text-white transition-colors inline-flex items-center gap-1.5"
                  >
                    <Mail size={11} />
                    contact
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
          <p>© {year} TrustAudit. Built for Indian MSME compliance.</p>
          <p className="italic">
            TrustAudit is a YC demo. Not a substitute for ITR filing advice.
          </p>
        </div>
      </div>
    </footer>
  );
}

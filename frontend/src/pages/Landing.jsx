import { Suspense, lazy, useState } from "react";
import { motion } from "framer-motion";
import { Shield, ArrowRight, Menu, X } from "lucide-react";

import DemoCTAPanel from "../components/landing/DemoCTAPanel";
import HowItWorksSteps from "../components/landing/HowItWorksSteps";
import FeatureGrid from "../components/landing/FeatureGrid";
import StatsStrip from "../components/landing/StatsStrip";
import Testimonials from "../components/landing/Testimonials";
import FAQSection from "../components/landing/FAQSection";
import Footer from "../components/landing/Footer";
import ProductPitchScroll from "../components/landing/ProductPitchScroll";

// Lazy load the hero visual so first paint isn't blocked by its cost.
const ShieldHero3D = lazy(() => import("../components/landing/ShieldHero3D"));

function HeroShieldFallback() {
  return (
    <div className="relative w-full aspect-square max-w-[520px] mx-auto flex items-center justify-center">
      <div className="relative w-28 h-32 rounded-2xl bg-white border border-zinc-200 shadow-sm flex items-center justify-center">
        <Shield size={36} className="text-emerald-600" strokeWidth={1.6} />
      </div>
    </div>
  );
}

function TopBar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navLinks = [
    { href: "#how-it-works", label: "How it works" },
    { href: "#try-live", label: "Try demo" },
    { href: "/apply", label: "Request pilot" },
    { href: "#faq", label: "FAQ" },
    { href: "/about", label: "About" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur">
      <div className="max-w-7xl mx-auto px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <a href="/" className="flex items-center gap-3 group">
          <div className="relative w-9 h-9 rounded-md bg-zinc-900 flex items-center justify-center">
            <Shield size={16} className="text-white" strokeWidth={2.5} />
          </div>
          <div className="flex flex-col">
            <span className="text-zinc-900 font-semibold text-[17px] tracking-tight leading-none">
              TrustAudit
            </span>
            <span className="text-[10px] text-zinc-500 tracking-wide mt-0.5">
              Invoice acceptance engine
            </span>
          </div>
        </a>

        {/* Center nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-3 py-2 text-[13px] font-medium text-zinc-600 hover:text-zinc-900 transition-colors"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right CTAs */}
        <div className="hidden md:flex items-center gap-3">
          <a href="/auth/vendor/signin" className="btn btn-md btn-ghost">
            Sign in
          </a>
          <a href="/apply" className="btn btn-md btn-primary">
            Request pilot
            <ArrowRight size={12} strokeWidth={2.5} />
          </a>
        </div>

        {/* Mobile burger */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden btn btn-md btn-ghost !px-3"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={16} /> : <Menu size={16} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-zinc-200 bg-white">
          <div className="px-8 py-6 flex flex-col gap-2">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-[13px] font-medium text-zinc-600 hover:text-zinc-900 py-2"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-4 border-t border-zinc-200 flex gap-2 mt-2">
              <a href="/auth/vendor/signin" className="btn btn-md btn-ghost flex-1">
                Sign in
              </a>
              <a href="/apply" className="btn btn-md btn-primary flex-1">
                Request pilot
              </a>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden bg-white">
      {/* Subtle dotted grid — industry-standard Linear/Vercel style */}
      <div aria-hidden className="pointer-events-none absolute inset-0 hero-grid" />
      <div className="relative max-w-7xl mx-auto px-8 pt-20 md:pt-28 pb-20 md:pb-28 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left 55% */}
        <div className="lg:col-span-7">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            className="chip mb-8"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Built for AP teams at Indian enterprises
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
            className="text-[44px] md:text-[68px] font-semibold leading-[1.04] tracking-[-0.035em] text-zinc-900"
          >
            Unblocking{" "}
            <span className="font-serif-italic text-emerald-700">supplier</span>{" "}
            <span className="font-serif-italic text-emerald-700">payments</span>
            <br />
            in India.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.12 }}
            className="mt-8 text-[16px] md:text-[17px] text-zinc-600 max-w-xl leading-relaxed"
          >
            TrustAudit helps Indian AP teams decide which supplier invoices
            are actually safe to pay. We ingest delivery and acceptance proof
            from WhatsApp, photos, PDFs, PODs, and stamped paperwork, match it
            to the right invoice, and tell finance whether a bill is{" "}
            <span className="font-mono text-emerald-700">clear to claim</span>,
            disputed, or still missing proof.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.18 }}
            className="mt-10 flex flex-wrap items-center gap-3"
          >
            <a href="/apply" className="btn btn-hero btn-primary">
              Request a pilot
              <ArrowRight size={14} strokeWidth={2.5} />
            </a>
            <a href="#try-live" className="btn btn-hero btn-ghost">
              See the live demo
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="mt-12"
          >
            <StatsStrip compact />
          </motion.div>
        </div>

        {/* Right 45% — hero visual */}
        <div className="lg:col-span-5">
          <Suspense fallback={<HeroShieldFallback />}>
            <ShieldHero3D />
          </Suspense>
        </div>
      </div>
    </section>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-white text-zinc-900 font-sans antialiased">
      <TopBar />
      <main>
        <Hero />
        <ProductPitchScroll />
        <DemoCTAPanel />
        <HowItWorksSteps />
        <FeatureGrid />
        <Testimonials />
        <FAQSection />
      </main>
      <Footer />
    </div>
  );
}

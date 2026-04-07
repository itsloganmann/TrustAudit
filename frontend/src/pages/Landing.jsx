import { Suspense, lazy, useState } from "react";
import { motion } from "framer-motion";
import { Shield, ArrowRight, Menu, X } from "lucide-react";

import ParticleField from "../components/landing/ParticleField";
import DemoCTAPanel from "../components/landing/DemoCTAPanel";
import HowItWorksSteps from "../components/landing/HowItWorksSteps";
import FeatureGrid from "../components/landing/FeatureGrid";
import StatsStrip from "../components/landing/StatsStrip";
import Testimonials from "../components/landing/Testimonials";
import FAQSection from "../components/landing/FAQSection";
import Footer from "../components/landing/Footer";
import ProductPitchScroll from "../components/landing/ProductPitchScroll";

// Lazy load the hero visual so first paint isn't blocked by its SVG cost.
const ShieldHero3D = lazy(() => import("../components/landing/ShieldHero3D"));

function HeroShieldFallback() {
  return (
    <div className="relative w-full aspect-square max-w-[520px] mx-auto flex items-center justify-center">
      <div
        className="absolute inset-[15%] rounded-full"
        style={{
          background: "radial-gradient(circle, rgba(16,185,129,0.2) 0%, transparent 60%)",
          filter: "blur(30px)",
        }}
      />
      <div className="relative w-28 h-32 rounded-2xl frost-card glass-shimmer flex items-center justify-center">
        <Shield size={36} className="text-emerald-400/70" strokeWidth={1.6} />
      </div>
    </div>
  );
}

function TopBar() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const navLinks = [
    { href: "#how-it-works", label: "How it works" },
    { href: "#try-live", label: "Try demo" },
    { href: "#faq", label: "FAQ" },
    { href: "/about", label: "About" },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-white/[0.06] bg-slate-950/70 backdrop-blur-xl">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
        {/* Brand */}
        <a href="/" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
            <Shield size={15} className="text-slate-950" strokeWidth={2.5} />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-white font-semibold text-[15px] tracking-tight">
              TrustAudit
            </span>
            <span className="text-[10px] text-slate-500 font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08]">
              43B(h)
            </span>
          </div>
        </a>

        {/* Center nav */}
        <nav className="hidden md:flex items-center gap-7">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="text-[13px] text-slate-400 hover:text-white transition-colors font-medium"
            >
              {link.label}
            </a>
          ))}
        </nav>

        {/* Right CTAs */}
        <div className="hidden md:flex items-center gap-2">
          <a
            href="/auth/vendor/signin"
            className="px-3.5 h-9 rounded-lg text-[13px] text-slate-300 hover:text-white transition-colors inline-flex items-center font-medium"
          >
            Sign in
          </a>
          <a
            href="/auth/vendor/signup"
            className="px-4 h-9 rounded-lg bg-white hover:bg-slate-100 text-slate-950 text-[13px] font-semibold tracking-tight inline-flex items-center gap-1.5 transition-all"
          >
            Get started
            <ArrowRight size={13} strokeWidth={2.5} />
          </a>
        </div>

        {/* Mobile burger */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          className="md:hidden p-2 rounded-lg glass-xl text-white"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden border-t border-white/[0.06] bg-slate-950/95 backdrop-blur-xl">
          <div className="px-6 py-4 flex flex-col gap-3">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="text-[14px] text-slate-300 hover:text-white py-1.5"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-3 border-t border-white/[0.06] flex gap-2">
              <a
                href="/auth/vendor/signin"
                className="flex-1 h-10 rounded-lg glass-xl text-white text-[13px] font-semibold flex items-center justify-center"
              >
                Sign in
              </a>
              <a
                href="/auth/vendor/signup"
                className="flex-1 h-10 rounded-lg bg-white text-slate-950 text-[13px] font-semibold flex items-center justify-center"
              >
                Get started
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
    <section className="relative overflow-hidden">
      <ParticleField density={70} />

      {/* Hero glow accents */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px]"
        style={{
          background:
            "radial-gradient(ellipse at center, rgba(16,185,129,0.15) 0%, transparent 60%)",
          filter: "blur(40px)",
        }}
      />

      <div className="relative max-w-6xl mx-auto px-6 pt-16 md:pt-24 pb-20 md:pb-28 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
        {/* Left 55% */}
        <div className="lg:col-span-7">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[11px] text-emerald-300 font-semibold tracking-wide mb-6"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
            Live — Section 43B(h) compliance engine
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="text-[40px] md:text-[58px] leading-[1.02] font-bold text-white tracking-tight"
          >
            Never miss a{" "}
            <span className="relative inline-block">
              <span className="relative z-10">43B(h) deadline</span>
              <span
                className="absolute left-0 right-0 bottom-1 md:bottom-2 h-2.5 md:h-3 rounded-sm"
                style={{
                  background:
                    "linear-gradient(90deg, rgba(16,185,129,0.35), rgba(59,130,246,0.15))",
                }}
              />
            </span>
            <br />
            again.
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.16 }}
            className="mt-6 text-[16px] md:text-[18px] text-slate-400 max-w-2xl leading-relaxed"
          >
            TrustAudit turns every WhatsApp challan photo into a real-time
            Section 43B(h) compliance shield. Drivers send photos. Your CFO sees
            a filing-ready PDF in under 15 seconds. Zero missed deadlines. Zero
            disallowed deductions.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.24 }}
            className="mt-8 flex flex-wrap items-center gap-3"
          >
            <a
              href="#try-live"
              className="inline-flex items-center gap-2 px-6 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[14px] tracking-tight transition-all shadow-[0_14px_48px_-12px_rgba(16,185,129,0.7)]"
            >
              Try the live demo
              <ArrowRight size={15} strokeWidth={2.5} />
            </a>
            <a
              href="/auth/vendor/signin"
              className="inline-flex items-center gap-2 px-6 h-12 rounded-xl frost-card text-white font-semibold text-[14px] tracking-tight"
            >
              <span className="relative">Sign in as CFO</span>
            </a>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.32 }}
            className="mt-8"
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

      {/* Subtle bottom fade to transition into the pitch section */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-32"
        style={{
          background:
            "linear-gradient(to bottom, transparent, rgba(2,6,23,0.8) 60%, #020617 100%)",
        }}
      />
    </section>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-400 font-sans antialiased">
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

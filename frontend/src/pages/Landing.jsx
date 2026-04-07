import { Suspense, lazy, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
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
import MagneticCTA from "../components/effects/MagneticCTA";

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
    <header className="sticky top-0 z-50 border-b border-violet-500/10 bg-[#06070f]/80 backdrop-blur-2xl">
      <div className="max-w-7xl mx-auto px-8 h-20 flex items-center justify-between">
        {/* Brand */}
        <a href="/" className="flex items-center gap-3 group">
          <div className="relative w-10 h-10 rounded-md bg-gradient-to-br from-violet-400 via-fuchsia-400 to-amber-300 flex items-center justify-center shadow-[0_0_30px_-4px_rgba(167,139,250,0.6)]">
            <span className="aurora-headline text-[20px] text-[#06070f] leading-none">A</span>
          </div>
          <div className="flex flex-col">
            <span className="aurora-headline text-[22px] text-white leading-none">
              TrustAudit
            </span>
            <span className="font-mono text-[9px] text-violet-300/70 tracking-[0.3em] uppercase mt-0.5">
              Section 43B(h) Engine
            </span>
          </div>
        </a>

        {/* Center nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navLinks.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="px-4 py-2 font-mono text-[10px] uppercase tracking-[0.18em] text-violet-200/60 hover:text-white transition-colors"
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
          <a href="/auth/vendor/signup" className="btn btn-md btn-primary">
            Get started
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
        <div className="md:hidden border-t border-violet-500/10 bg-[#06070f]/95 backdrop-blur-2xl">
          <div className="px-8 py-6 flex flex-col gap-2">
            {navLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="font-mono text-[11px] uppercase tracking-[0.2em] text-violet-200/70 hover:text-white py-2"
              >
                {link.label}
              </a>
            ))}
            <div className="pt-4 border-t border-violet-500/10 flex gap-2 mt-2">
              <a href="/auth/vendor/signin" className="btn btn-md btn-ghost flex-1">
                Sign in
              </a>
              <a href="/auth/vendor/signup" className="btn btn-md btn-primary flex-1">
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

      <div className="relative max-w-7xl mx-auto px-8 pt-24 md:pt-32 pb-24 md:pb-32 grid grid-cols-1 lg:grid-cols-12 gap-12 items-center">
        {/* Left 55% */}
        <div className="lg:col-span-7">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="chip mb-8 !bg-violet-500/8 !border-violet-400/30 !text-violet-200"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[#a78bfa] pulse-dot" />
            Live · Compliance Engine v2
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
            className="aurora-headline text-[64px] md:text-[96px] leading-[0.92] text-white"
          >
            The end of the
            <br />
            <span className="bg-gradient-to-r from-violet-300 via-fuchsia-300 to-amber-300 bg-clip-text text-transparent">
              ₹12,000 crore
            </span>
            <br />
            <span className="font-display-italic text-violet-200/80">tax cliff.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.16 }}
            className="mt-10 text-[16px] md:text-[17px] text-violet-100/60 max-w-xl leading-relaxed font-light"
          >
            TrustAudit turns every WhatsApp challan into a real-time Section 43B(h)
            compliance shield. Drivers snap photos. Your CFO sees a filing-ready
            PDF in <span className="font-mono text-violet-200">15 seconds</span>.
            Zero missed deadlines. Zero disallowed deductions.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.24 }}
            className="mt-12 flex flex-wrap items-center gap-4"
          >
            <MagneticCTA strength={0.4} radius={120}>
              <a href="#try-live" className="btn btn-hero btn-aurora">
                <span className="relative z-10">Try the live demo</span>
                <ArrowRight size={14} strokeWidth={2.5} className="relative z-10" />
              </a>
            </MagneticCTA>
            <MagneticCTA strength={0.3} radius={100}>
              <a href="/auth/vendor/signin" className="btn btn-hero btn-ghost">
                Sign in as CFO
              </a>
            </MagneticCTA>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.32 }}
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

      {/* Subtle bottom fade to transition into the pitch section */}
      <div
        className="pointer-events-none absolute bottom-0 left-0 right-0 h-40"
        style={{
          background:
            "linear-gradient(to bottom, transparent, rgba(6,7,15,0.8) 60%, #06070f 100%)",
        }}
      />
    </section>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-[#06070f] text-violet-100/70 font-sans antialiased relative">
      <div className="ambient-bg" aria-hidden />
      <div className="relative" style={{ zIndex: 1 }}>
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
    </div>
  );
}

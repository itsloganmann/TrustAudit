import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Shield,
  Linkedin,
  Github,
  Mail,
  MapPin,
  Briefcase,
  GraduationCap,
  Rocket,
  Twitter,
  Users,
  CalendarClock,
  TrendingDown,
  Lightbulb,
  Handshake,
  FileCheck,
  PlayCircle,
} from "lucide-react";

// Cofounder data lives in a single source of truth so future edits
// only touch one place. Profile photos live at /public/team/<slug>.jpg —
// if missing, we fall through to a stylized SVG and finally initials.
const COFOUNDERS = [
  {
    slug: "logan",
    name: "Logan Mann",
    role: "Co-founder & CTO",
    tagline: "LLM Researcher @ PocketFM",
    location: "San Jose, California",
    initials: "LM",
    gradientFrom: "#10b981",
    gradientVia: "#06b6d4",
    gradientTo: "#3b82f6",
    photo: "/team/logan.jpg",
    photoFallback: "/team/logan.svg",
    bio:
      "Ships end-to-end AI agents for a living. Leads the TrustAudit " +
      "vision pipeline, the 43B(h) state machine, and the autonomous " +
      "test harness that has to stay green before every demo.",
    credentials: [
      { icon: Briefcase, label: "LLM Researcher @ PocketFM" },
      { icon: GraduationCap, label: "CE @ UC Santa Barbara" },
      { icon: Rocket, label: "Shipping AI agents since 2023" },
    ],
    links: [
      {
        kind: "linkedin",
        label: "LinkedIn",
        href: "https://www.linkedin.com/in/logansmann",
        Icon: Linkedin,
      },
      {
        kind: "github",
        label: "GitHub",
        href: "https://github.com/itsloganmann",
        Icon: Github,
      },
    ],
  },
  {
    slug: "arnav",
    name: "Arnav Bhardwaj",
    role: "Co-founder & CEO",
    tagline: "UC Berkeley Haas · Carbyn AI",
    location: "San Francisco Bay Area",
    initials: "AB",
    gradientFrom: "#f59e0b",
    gradientVia: "#f43f5e",
    gradientTo: "#8b5cf6",
    photo: "/team/arnav.jpg",
    photoFallback: "/team/arnav.svg",
    bio:
      "Runs strategy, GTM, and partnerships. Deep roots in the Indian " +
      "MSME ecosystem and the founder Arnav behind Carbyn AI. Leading " +
      "TrustAudit's pilots with Indian enterprise CFO teams.",
    credentials: [
      { icon: Briefcase, label: "Strategy & GTM · Partnerships" },
      { icon: GraduationCap, label: "UC Berkeley Haas School of Business" },
      { icon: Rocket, label: "Founder @ Carbyn AI" },
    ],
    links: [
      {
        kind: "linkedin",
        label: "LinkedIn",
        href: "https://www.linkedin.com/in/thearnavbhardwaj/",
        Icon: Linkedin,
      },
      {
        kind: "email",
        label: "arnavbhardwaj@berkeley.edu",
        href: "mailto:arnavbhardwaj@berkeley.edu",
        Icon: Mail,
      },
    ],
  },
];

// Founder-market-fit stats. These are the three numbers that explain
// why TrustAudit has to exist *now*.
const WHY_STATS = [
  {
    icon: Users,
    value: "63 million",
    label: "Indian MSMEs",
    detail:
      "Every one of them carries payment risk for the corporates they supply.",
    accentFrom: "#10b981",
    accentTo: "#06b6d4",
  },
  {
    icon: CalendarClock,
    value: "45 days",
    label: "43B(h) cliff",
    detail:
      "After acceptance, the buyer's tax deduction vanishes if the invoice goes unpaid.",
    accentFrom: "#06b6d4",
    accentTo: "#3b82f6",
  },
  {
    icon: TrendingDown,
    value: "₹2 trillion",
    label: "annual MSME receivables exposure",
    detail:
      "The total amount of working capital trapped behind 43B(h) every year.",
    accentFrom: "#8b5cf6",
    accentTo: "#f43f5e",
  },
];

// "How we got here" timeline. Keep these short — they read as a sparkline
// of the company, not as a CV.
const TIMELINE = [
  {
    when: "2024",
    title: "The idea",
    Icon: Lightbulb,
    body:
      "Logan and Arnav meet around a 43B(h) tax post that nobody at the table can fully explain. They go look — and find a ₹12,000 crore problem hiding in plain sight.",
    accent: "#10b981",
  },
  {
    when: "2025",
    title: "First pilot",
    Icon: Handshake,
    body:
      "TrustAudit ships a WhatsApp-first verification flow with one Indian enterprise. Within two weeks, the CFO can see their entire MSME exposure on a single screen.",
    accent: "#06b6d4",
  },
  {
    when: "2025 · Q4",
    title: "YC application",
    Icon: FileCheck,
    body:
      "We submit to Y Combinator with the full vision pipeline, the autonomous test harness, and the real Indian customer asking us to scale.",
    accent: "#8b5cf6",
  },
  {
    when: "2026 · Q1",
    title: "Customer demos",
    Icon: PlayCircle,
    body:
      "Live demos with Indian CFO teams. Every demo ends the same way: 'How fast can we get this onto our supplier base?'",
    accent: "#f43f5e",
  },
];

// External CTAs for the "Press + talk to us" block.
const CONTACT_LINKS = [
  {
    kind: "linkedin-logan",
    label: "Logan on LinkedIn",
    href: "https://www.linkedin.com/in/logansmann",
    Icon: Linkedin,
  },
  {
    kind: "linkedin-arnav",
    label: "Arnav on LinkedIn",
    href: "https://www.linkedin.com/in/thearnavbhardwaj/",
    Icon: Linkedin,
  },
  {
    kind: "email",
    label: "arnavbhardwaj@berkeley.edu",
    href: "mailto:arnavbhardwaj@berkeley.edu",
    Icon: Mail,
  },
  {
    kind: "twitter",
    label: "@trustaudit",
    href: "https://twitter.com/trustaudit",
    Icon: Twitter,
  },
];

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.15 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 32 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 180, damping: 22 },
  },
};

function AvatarBubble({ founder, hovered }) {
  // Fallback chain: jpg -> svg -> initials. We use a stage counter so React
  // owns the swap instead of mutating the DOM via the onError handler.
  // 0 = primary jpg, 1 = stylized svg, 2 = inline initials.
  const [stage, setStage] = useState(0);
  const sources = [founder.photo, founder.photoFallback].filter(Boolean);
  const showImage = stage < sources.length;
  const currentSrc = showImage ? sources[stage] : null;

  return (
    <div className="relative shrink-0">
      {/* Outer glow ring — accelerates on hover (4.5s vs 14s) and lifts +6px */}
      <motion.div
        aria-hidden
        className="absolute -inset-1 rounded-full opacity-70 blur-xl"
        style={{
          background: `conic-gradient(from 180deg at 50% 50%, ${founder.gradientFrom}, ${founder.gradientVia}, ${founder.gradientTo}, ${founder.gradientFrom})`,
        }}
        animate={{ rotate: 360 }}
        transition={{
          duration: hovered ? 4.5 : 14,
          repeat: Infinity,
          ease: "linear",
        }}
      />
      {/* Photo or initials circle */}
      <div
        className="relative w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden border-2 border-white/20 bg-slate-900 flex items-center justify-center"
        style={{
          backgroundImage: `linear-gradient(135deg, ${founder.gradientFrom}, ${founder.gradientVia}, ${founder.gradientTo})`,
        }}
      >
        {showImage ? (
          <img
            // key forces the <img> to remount when the source changes so
            // failed loads can re-trigger onError on the new src.
            key={currentSrc}
            src={currentSrc}
            alt={`${founder.name} headshot`}
            className="w-full h-full object-cover"
            onError={() => setStage((prev) => prev + 1)}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-white font-black tracking-tight"
            style={{ fontSize: "2.2rem" }}
          >
            {founder.initials}
          </div>
        )}
      </div>
    </div>
  );
}

function WhyStatCard({ stat }) {
  const Icon = stat.icon;
  // We use .glass as the base (frost-card from W7 hasn't merged yet) plus
  // a per-card gradient halo so the three cards still feel distinct.
  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -4, transition: { type: "spring", stiffness: 300 } }}
      className="glass relative overflow-hidden rounded-2xl p-5 md:p-6"
    >
      {/* Per-card halo */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-[1px] rounded-2xl opacity-40"
        style={{
          background: `radial-gradient(380px circle at 50% -20%, ${stat.accentFrom}22, transparent 50%), radial-gradient(380px circle at 100% 120%, ${stat.accentTo}22, transparent 50%)`,
        }}
      />

      <div className="relative">
        <div
          className="inline-flex items-center justify-center w-9 h-9 rounded-lg"
          style={{
            background: `linear-gradient(135deg, ${stat.accentFrom}, ${stat.accentTo})`,
          }}
        >
          <Icon size={16} className="text-white" strokeWidth={2.4} />
        </div>

        <p className="mt-4 text-[28px] md:text-[32px] font-black text-white tracking-tight leading-none">
          {stat.value}
        </p>
        <p className="mt-1 text-[12px] uppercase tracking-[0.18em] font-semibold text-slate-400">
          {stat.label}
        </p>
        <p className="mt-3 text-[13px] text-slate-300 leading-relaxed">
          {stat.detail}
        </p>
      </div>
    </motion.div>
  );
}

function Timeline({ items }) {
  return (
    <div className="relative">
      {/* Vertical spine */}
      <div
        aria-hidden
        className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px md:-translate-x-px"
        style={{
          background:
            "linear-gradient(180deg, transparent, rgba(255,255,255,0.18) 12%, rgba(255,255,255,0.18) 88%, transparent)",
        }}
      />

      <ol className="space-y-8 md:space-y-10">
        {items.map((node, index) => (
          <TimelineNode
            key={node.when + node.title}
            node={node}
            index={index}
          />
        ))}
      </ol>
    </div>
  );
}

function TimelineNode({ node, index }) {
  const isLeft = index % 2 === 0;
  const { Icon } = node;
  return (
    <motion.li
      variants={cardVariants}
      className="relative md:grid md:grid-cols-2 md:gap-10 items-start"
    >
      {/* Spine dot */}
      <div
        aria-hidden
        className="absolute left-4 md:left-1/2 top-2 w-3 h-3 -translate-x-[5px] md:-translate-x-1/2 rounded-full ring-4 ring-slate-950"
        style={{
          background: node.accent,
          boxShadow: `0 0 0 1px ${node.accent}66, 0 0 18px ${node.accent}66`,
        }}
      />

      {/* Card column. On md+ we alternate left/right; on mobile everything stacks right of the spine. */}
      <div
        className={
          isLeft
            ? "pl-12 md:pl-0 md:pr-10 md:text-right"
            : "pl-12 md:pl-10 md:col-start-2"
        }
      >
        <div className="glass inline-block max-w-md text-left rounded-2xl p-5">
          <div
            className={
              isLeft
                ? "flex items-center gap-2 md:flex-row-reverse md:justify-start"
                : "flex items-center gap-2"
            }
          >
            <div
              className="inline-flex items-center justify-center w-8 h-8 rounded-lg"
              style={{
                background: `linear-gradient(135deg, ${node.accent}cc, ${node.accent}66)`,
              }}
            >
              <Icon size={14} className="text-white" strokeWidth={2.4} />
            </div>
            <p
              className="text-[11px] uppercase tracking-[0.3em] font-semibold"
              style={{ color: node.accent }}
            >
              {node.when}
            </p>
          </div>
          <h3 className="mt-2 text-[18px] md:text-[20px] font-black text-white tracking-tight">
            {node.title}
          </h3>
          <p className="mt-2 text-[13px] text-slate-300 leading-relaxed">
            {node.body}
          </p>
        </div>
      </div>
    </motion.li>
  );
}

function FounderCard({ founder }) {
  const [hovered, setHovered] = useState(false);
  return (
    <motion.article
      variants={cardVariants}
      whileHover={{ y: -6, transition: { type: "spring", stiffness: 300 } }}
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      className="relative overflow-hidden rounded-3xl p-6 md:p-8 group"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.02) 100%)",
        backdropFilter: "blur(18px) saturate(140%)",
        WebkitBackdropFilter: "blur(18px) saturate(140%)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Animated caustic light sheen */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-[2px] rounded-3xl opacity-40 group-hover:opacity-80 transition-opacity"
        style={{
          background: `radial-gradient(600px circle at 20% -10%, ${founder.gradientFrom}22, transparent 40%), radial-gradient(600px circle at 100% 100%, ${founder.gradientTo}22, transparent 40%)`,
        }}
      />

      <div className="relative flex flex-col md:flex-row gap-6 md:gap-8">
        <AvatarBubble founder={founder} hovered={hovered} />

        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.3em] font-semibold text-emerald-400">
            {founder.role}
          </p>
          <h2 className="mt-1 text-[28px] md:text-[32px] font-black text-white tracking-tight leading-tight">
            {founder.name}
          </h2>
          <p className="mt-1 text-[14px] text-slate-300">{founder.tagline}</p>
          <div className="mt-1 flex items-center gap-1 text-[12px] text-slate-500">
            <MapPin size={11} />
            <span>{founder.location}</span>
          </div>

          <p className="mt-4 text-[14px] leading-relaxed text-slate-300">
            {founder.bio}
          </p>

          {/* Credentials chips */}
          <ul className="mt-5 flex flex-wrap gap-2">
            {founder.credentials.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.04] border border-white/[0.08] text-[11px] text-slate-300"
              >
                <Icon size={11} className="text-emerald-400" />
                <span>{label}</span>
              </li>
            ))}
          </ul>

          {/* Links */}
          <div className="mt-6 flex flex-wrap gap-2">
            {founder.links.map(({ kind, label, href, Icon }) => (
              <motion.a
                key={kind}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                href={href}
                target={kind === "email" ? undefined : "_blank"}
                rel={kind === "email" ? undefined : "noopener noreferrer"}
                className="inline-flex items-center gap-2 px-4 h-10 rounded-xl border border-white/10 bg-white/[0.03] text-[13px] font-semibold text-white hover:bg-white/[0.06] transition-colors"
              >
                <Icon size={14} />
                <span>{label}</span>
              </motion.a>
            ))}
          </div>
        </div>
      </div>
    </motion.article>
  );
}

export default function About() {
  return (
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      {/* Ambient gradient orbs — pure CSS, GPU-cheap */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(900px circle at 10% 0%, rgba(16,185,129,0.12), transparent 40%), radial-gradient(900px circle at 100% 100%, rgba(139,92,246,0.12), transparent 40%)",
        }}
      />

      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-slate-950/70 backdrop-blur-xl">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <ArrowLeft size={16} className="text-slate-400" />
            <span className="text-[13px] text-slate-300">Back to home</span>
          </a>
          <a href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
              <Shield size={15} className="text-slate-950" strokeWidth={2.5} />
            </div>
            <span className="text-white font-semibold text-[15px] tracking-tight">
              TrustAudit
            </span>
          </a>
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-6 pt-14 pb-24">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <p className="text-[11px] uppercase tracking-[0.4em] font-semibold text-emerald-400">
            The team behind TrustAudit
          </p>
          <h1 className="mt-3 text-[40px] md:text-[52px] font-black text-white tracking-tight leading-[1.05]">
            Two founders, one mission:
            <span
              className="block bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  "linear-gradient(120deg, #10b981 0%, #06b6d4 35%, #3b82f6 70%, #8b5cf6 100%)",
              }}
            >
              save Indian MSMEs from the 43B(h) cliff.
            </span>
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-[14px] md:text-[15px] text-slate-400 leading-relaxed">
            Indian MSMEs lose <span className="text-white font-semibold">₹12,000 crore</span> per year to Section 43B(h) cliff
            enforcement. We built TrustAudit because the two of us were in the
            rooms where this happened and nobody was solving it.
          </p>
        </motion.div>

        {/* Why TrustAudit — three founder-market-fit stat cards */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mt-16"
          aria-label="Why TrustAudit"
        >
          <div className="text-center mb-8">
            <p className="text-[11px] uppercase tracking-[0.4em] font-semibold text-emerald-400">
              Why TrustAudit
            </p>
            <h2 className="mt-2 text-[24px] md:text-[28px] font-black text-white tracking-tight">
              The market that nobody else is staring at.
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5">
            {WHY_STATS.map((stat) => (
              <WhyStatCard key={stat.label} stat={stat} />
            ))}
          </div>
        </motion.section>

        {/* Cofounder cards */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mt-16 grid grid-cols-1 md:grid-cols-2 gap-6"
          aria-label="Cofounders"
        >
          {COFOUNDERS.map((f) => (
            <FounderCard key={f.slug} founder={f} />
          ))}
        </motion.section>

        {/* How we got here — timeline */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-20"
          aria-label="How we got here"
        >
          <div className="text-center mb-10">
            <p className="text-[11px] uppercase tracking-[0.4em] font-semibold text-emerald-400">
              How we got here
            </p>
            <h2 className="mt-2 text-[24px] md:text-[28px] font-black text-white tracking-tight">
              From late-night idea to live customer demos.
            </h2>
          </div>

          <Timeline items={TIMELINE} />
        </motion.section>

        {/* Press + talk to us */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.2 }}
          className="mt-20"
          aria-label="Press and contact"
        >
          <div className="text-center mb-6">
            <p className="text-[11px] uppercase tracking-[0.4em] font-semibold text-emerald-400">
              Press + talk to us
            </p>
            <h2 className="mt-2 text-[24px] md:text-[28px] font-black text-white tracking-tight">
              Reporters, operators, and investors — we read everything.
            </h2>
            <p className="mt-3 max-w-xl mx-auto text-[13px] text-slate-400">
              The fastest way to reach the founders is the channel they live
              in. We answer everything within 24 hours.
            </p>
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {CONTACT_LINKS.map((link) => {
              const LinkIcon = link.Icon;
              return (
                <motion.a
                  key={link.kind}
                  whileHover={{ scale: 1.04, y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  href={link.href}
                  target={link.kind === "email" ? undefined : "_blank"}
                  rel={
                    link.kind === "email" ? undefined : "noopener noreferrer"
                  }
                  className="inline-flex items-center gap-2 px-4 h-11 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-[13px] font-semibold text-white transition-colors"
                >
                  <LinkIcon size={14} className="text-emerald-400" />
                  <span>{link.label}</span>
                </motion.a>
              );
            })}
          </div>
        </motion.section>

        {/* CTA ribbon */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5, duration: 0.5 }}
          className="mt-16 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-6 md:p-8 text-center"
        >
          <p className="text-[13px] text-slate-300">
            Want to talk shop with the founders? Ping us on LinkedIn or the
            WhatsApp number on the live demo page.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 justify-center">
            <a
              href="/live"
              className="inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[13px] transition-colors"
            >
              Try the live demo
            </a>
            <a
              href="/auth/vendor/signup"
              className="inline-flex items-center gap-2 px-5 h-11 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white font-semibold text-[13px] transition-colors"
            >
              Sign up as a vendor
            </a>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

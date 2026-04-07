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
} from "lucide-react";

// Cofounder data lives in a single source of truth so future edits
// only touch one place. Profile photos live at /public/team/<slug>.jpg —
// if they're missing we gracefully fall back to initials-on-gradient.
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
        href: "https://www.linkedin.com/in/arnavbhardwaj",
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

function AvatarBubble({ founder }) {
  return (
    <div className="relative shrink-0">
      {/* Outer glow ring — reacts to hover */}
      <motion.div
        aria-hidden
        className="absolute -inset-1 rounded-full opacity-70 blur-xl"
        style={{
          background: `conic-gradient(from 180deg at 50% 50%, ${founder.gradientFrom}, ${founder.gradientVia}, ${founder.gradientTo}, ${founder.gradientFrom})`,
        }}
        initial={{ rotate: 0 }}
        animate={{ rotate: 360 }}
        transition={{ duration: 14, repeat: Infinity, ease: "linear" }}
      />
      {/* Photo or initials circle */}
      <div
        className="relative w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden border-2 border-white/20 bg-slate-900 flex items-center justify-center"
        style={{
          backgroundImage: `linear-gradient(135deg, ${founder.gradientFrom}, ${founder.gradientVia}, ${founder.gradientTo})`,
        }}
      >
        {/* Try the photo first; swap to initials if it 404s */}
        <img
          src={founder.photo}
          alt={`${founder.name} headshot`}
          className="w-full h-full object-cover"
          onError={(e) => {
            e.currentTarget.style.display = "none";
            const sibling = e.currentTarget.nextElementSibling;
            if (sibling) sibling.style.opacity = "1";
          }}
        />
        <div
          className="absolute inset-0 flex items-center justify-center text-white font-black tracking-tight"
          style={{
            fontSize: "2.2rem",
            opacity: 0,
            transition: "opacity 0.2s ease",
          }}
        >
          {founder.initials}
        </div>
      </div>
    </div>
  );
}

function FounderCard({ founder }) {
  return (
    <motion.article
      variants={cardVariants}
      whileHover={{ y: -6, transition: { type: "spring", stiffness: 300 } }}
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
        className="pointer-events-none absolute -inset-[2px] rounded-3xl opacity-40 group-hover:opacity-70 transition-opacity"
        style={{
          background: `radial-gradient(600px circle at 20% -10%, ${founder.gradientFrom}22, transparent 40%), radial-gradient(600px circle at 100% 100%, ${founder.gradientTo}22, transparent 40%)`,
        }}
      />

      <div className="relative flex flex-col md:flex-row gap-6 md:gap-8">
        <AvatarBubble founder={founder} />

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
            TrustAudit is a WhatsApp-first tax shield for the 63 million Indian
            small businesses that carry payment risk for every corporate they
            supply. We built it because the two of us got tired of watching
            real money evaporate on a clause nobody reads.
          </p>
        </motion.div>

        {/* Cofounder cards */}
        <motion.section
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          className="mt-14 grid grid-cols-1 md:grid-cols-2 gap-6"
        >
          {COFOUNDERS.map((f) => (
            <FounderCard key={f.slug} founder={f} />
          ))}
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

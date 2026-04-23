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
    photo: "/team/logan.jpg",
    photoFallback: "/team/logan.svg",
    bio:
      "Ships end-to-end AI agents for a living. Leads the TrustAudit " +
      "proof-ingestion pipeline, the invoice-to-evidence matching engine, " +
      "and the autonomous test harness that has to stay green before " +
      "every demo.",
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
    tagline: "UC Berkeley Haas · GTM Intern @ Carbyn AI",
    location: "San Francisco Bay Area",
    initials: "AB",
    photo: "/team/arnav.jpg",
    photoFallback: "/team/arnav.svg",
    bio:
      "Runs strategy, GTM, and partnerships. Deep roots in the Indian " +
      "enterprise and MSME ecosystem. GTM intern at Carbyn AI. Leading " +
      "TrustAudit's pilots with AP teams in pharma distribution, " +
      "manufacturing, and industrial procurement.",
    credentials: [
      { icon: Briefcase, label: "Strategy & GTM · Partnerships" },
      { icon: GraduationCap, label: "UC Berkeley Haas School of Business" },
      { icon: Rocket, label: "GTM Intern @ Carbyn AI" },
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
    icon: TrendingDown,
    value: "$90B",
    label: "stuck in offline workflows",
    detail:
      "Enterprise-to-MSME payments in India move through WhatsApp photos, paper PODs, and stapled GRNs. AP teams can't tell which invoices are actually safe to pay.",
  },
  {
    icon: Users,
    value: "3 sectors",
    label: "pharma, manufacturing, industrial",
    detail:
      "Where the proof-matching problem is sharpest. Every pharma distributor, process manufacturer, and industrial procurement team runs this workflow by hand today.",
  },
  {
    icon: CalendarClock,
    value: "₹8 trillion",
    label: "annual flow we sit under",
    detail:
      "The acceptance decision for every one of these invoices eventually gates a payment. Own the decision layer, earn the right to expand into settlement and financing.",
  },
];

// "How we got here" timeline. Keep these short — they read as a sparkline
// of the company, not as a CV.
const TIMELINE = [
  {
    when: "2024",
    title: "Saw the problem",
    Icon: Lightbulb,
    body:
      "Working with Indian AP teams, we kept watching the same scene: a ledger open on one screen, a WhatsApp feed of delivery photos on another, and a clerk matching them by hand. ₹8 trillion a year moves through workflows that look like this. One named version of the blast radius: Section 43B(h), where a missed acceptance date erases a buyer's tax deduction.",
  },
  {
    when: "2025",
    title: "First MVP",
    Icon: Handshake,
    body:
      "Shipped the first end-to-end ingestion loop: WhatsApp and PDF proof in, vision-extracted fields matched to an invoice, a clear-to-claim or missing-proof verdict out. Ran it against real AP workflows, not demo data.",
  },
  {
    when: "2025 · Q4",
    title: "YC Summer 2026 application",
    Icon: FileCheck,
    body:
      "Submitted to Y Combinator with the decision layer framing: enterprise buyer pays, supplier uses it free, expansion into settlement and financing earns out from owning the acceptance call.",
  },
  {
    when: "2026",
    title: "Pilots",
    Icon: PlayCircle,
    body:
      "Rolling out pilots with AP teams in pharma distribution, manufacturing, and industrial procurement. Every demo ends the same way: 'How fast can we get this onto our supplier base?'",
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
    transition: { staggerChildren: 0.1, delayChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { type: "spring", stiffness: 180, damping: 22 },
  },
};

function AvatarBubble({ founder }) {
  // Fallback chain: jpg -> svg -> initials. We use a stage counter so React
  // owns the swap instead of mutating the DOM via the onError handler.
  // 0 = primary jpg, 1 = stylized svg, 2 = inline initials.
  const [stage, setStage] = useState(0);
  const sources = [founder.photo, founder.photoFallback].filter(Boolean);
  const showImage = stage < sources.length;
  const currentSrc = showImage ? sources[stage] : null;

  return (
    <div className="relative shrink-0">
      <div className="relative w-28 h-28 md:w-32 md:h-32 rounded-full overflow-hidden border border-zinc-200 ring-2 ring-emerald-500/20 bg-zinc-50 flex items-center justify-center">
        {showImage ? (
          <img
            key={currentSrc}
            src={currentSrc}
            alt={`${founder.name} headshot`}
            className="w-full h-full object-cover"
            onError={() => setStage((prev) => prev + 1)}
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-emerald-700 font-bold tracking-tight bg-emerald-50"
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
  return (
    <motion.div
      variants={cardVariants}
      whileHover={{ y: -2, transition: { type: "spring", stiffness: 300 } }}
      className="relative rounded-2xl p-5 md:p-6 bg-white border border-zinc-200 shadow-sm hover:border-zinc-300 transition-colors"
    >
      <div className="relative">
        <div className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-200">
          <Icon size={16} className="text-emerald-700" strokeWidth={2.4} />
        </div>

        <p className="mt-4 text-[28px] md:text-[32px] font-bold text-zinc-900 tracking-tight leading-none">
          {stat.value}
        </p>
        <p className="mt-1 text-[11px] uppercase tracking-[0.18em] font-semibold text-zinc-500">
          {stat.label}
        </p>
        <p className="mt-3 text-[13px] text-zinc-600 leading-relaxed">
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
        className="absolute left-4 md:left-1/2 top-0 bottom-0 w-px md:-translate-x-px bg-zinc-200"
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
        className="absolute left-4 md:left-1/2 top-2 w-3 h-3 -translate-x-[5px] md:-translate-x-1/2 rounded-full ring-4 ring-white bg-emerald-500"
      />

      {/* Card column. On md+ we alternate left/right; on mobile everything stacks right of the spine. */}
      <div
        className={
          isLeft
            ? "pl-12 md:pl-0 md:pr-10 md:text-right"
            : "pl-12 md:pl-10 md:col-start-2"
        }
      >
        <div className="inline-block max-w-md text-left rounded-2xl p-5 bg-white border border-zinc-200 shadow-sm">
          <div
            className={
              isLeft
                ? "flex items-center gap-2 md:flex-row-reverse md:justify-start"
                : "flex items-center gap-2"
            }
          >
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200">
              <Icon size={14} className="text-emerald-700" strokeWidth={2.4} />
            </div>
            <p className="text-[11px] uppercase tracking-[0.3em] font-semibold text-emerald-700">
              {node.when}
            </p>
          </div>
          <h3 className="mt-2 text-[18px] md:text-[20px] font-bold text-zinc-900 tracking-tight">
            {node.title}
          </h3>
          <p className="mt-2 text-[13px] text-zinc-600 leading-relaxed">
            {node.body}
          </p>
        </div>
      </div>
    </motion.li>
  );
}

function FounderCard({ founder }) {
  return (
    <motion.article
      variants={cardVariants}
      whileHover={{ y: -2, transition: { type: "spring", stiffness: 300 } }}
      className="relative overflow-hidden rounded-2xl p-6 md:p-8 bg-white border border-zinc-200 shadow-sm hover:border-zinc-300 transition-colors"
    >
      <div className="relative flex flex-col md:flex-row gap-6 md:gap-8">
        <AvatarBubble founder={founder} />

        <div className="min-w-0 flex-1">
          <p className="text-[10px] uppercase tracking-[0.3em] font-semibold text-emerald-700">
            {founder.role}
          </p>
          <h2 className="mt-2 aurora-headline text-[32px] md:text-[40px] text-zinc-900 leading-[0.95]">
            {founder.name}
          </h2>
          <p className="mt-1 text-[14px] text-zinc-600">{founder.tagline}</p>
          <div className="mt-1 flex items-center gap-1 text-[12px] text-zinc-500">
            <MapPin size={11} />
            <span>{founder.location}</span>
          </div>

          <p className="mt-4 text-[14px] leading-relaxed text-zinc-700">
            {founder.bio}
          </p>

          {/* Credentials chips */}
          <ul className="mt-5 flex flex-wrap gap-2">
            {founder.credentials.map(({ icon: Icon, label }) => (
              <li
                key={label}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-700"
              >
                <Icon size={11} className="text-emerald-700" />
                <span>{label}</span>
              </li>
            ))}
          </ul>

          {/* Links */}
          <div className="mt-6 flex flex-wrap gap-2">
            {founder.links.map(({ kind, label, href, Icon }) => (
              <motion.a
                key={kind}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.98 }}
                href={href}
                target={kind === "email" ? undefined : "_blank"}
                rel={kind === "email" ? undefined : "noopener noreferrer"}
                className="inline-flex items-center gap-2 px-4 h-10 rounded-lg border border-zinc-200 bg-white text-[13px] font-semibold text-zinc-900 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
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
    <div className="min-h-screen bg-white text-zinc-900 relative overflow-hidden">
      {/* Top bar */}
      <header className="sticky top-0 z-40 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <a href="/" className="flex items-center gap-2">
            <ArrowLeft size={16} className="text-zinc-500" />
            <span className="text-[13px] text-zinc-700">Back to home</span>
          </a>
          <a href="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center">
              <Shield size={15} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="text-zinc-900 font-semibold text-[15px] tracking-tight">
              TrustAudit
            </span>
          </a>
        </div>
      </header>

      <main className="relative max-w-5xl mx-auto px-6 pt-14 pb-24">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center"
        >
          <p className="text-[11px] uppercase tracking-[0.4em] font-semibold text-emerald-700">
            The team behind TrustAudit
          </p>
          <h1 className="mt-3 text-[40px] md:text-[52px] font-bold text-zinc-900 tracking-tight leading-[1.05]">
            Two founders, one mission:
            <span className="block text-emerald-700">
              unblock supplier payments in India.
            </span>
          </h1>
          <p className="mt-4 max-w-2xl mx-auto text-[14px] md:text-[15px] text-zinc-600 leading-relaxed">
            <span className="text-zinc-900 font-semibold">$90B a year</span> of
            enterprise-to-MSME payments in India sit behind WhatsApp photos,
            paper PODs, and stapled GRNs that nobody has matched to the
            invoice yet. We built TrustAudit so AP teams can finally tell the
            difference between a bill that is clear to claim and one that is
            still missing proof.
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
            <p className="text-[11px] uppercase tracking-[0.4em] font-semibold text-emerald-700">
              Why TrustAudit
            </p>
            <h2 className="mt-2 text-[24px] md:text-[28px] font-bold text-zinc-900 tracking-tight">
              The flow that nobody else is staring at.
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
            <p className="text-[11px] uppercase tracking-[0.4em] font-semibold text-emerald-700">
              How we got here
            </p>
            <h2 className="mt-2 text-[24px] md:text-[28px] font-bold text-zinc-900 tracking-tight">
              From a problem we kept watching to live pilots.
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
            <p className="text-[11px] uppercase tracking-[0.4em] font-semibold text-emerald-700">
              Press + talk to us
            </p>
            <h2 className="mt-2 text-[24px] md:text-[28px] font-bold text-zinc-900 tracking-tight">
              Reporters, operators, and investors — we read everything.
            </h2>
            <p className="mt-3 max-w-xl mx-auto text-[13px] text-zinc-600">
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
                  whileHover={{ scale: 1.03, y: -1 }}
                  whileTap={{ scale: 0.98 }}
                  href={link.href}
                  target={link.kind === "email" ? undefined : "_blank"}
                  rel={
                    link.kind === "email" ? undefined : "noopener noreferrer"
                  }
                  className="inline-flex items-center gap-2 px-4 h-11 rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50 hover:border-zinc-300 text-[13px] font-semibold text-zinc-900 transition-colors"
                >
                  <LinkIcon size={14} className="text-emerald-700" />
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
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mt-16 rounded-2xl border border-zinc-200 bg-zinc-50 p-6 md:p-8 text-center"
        >
          <p className="text-[13px] text-zinc-700">
            Want to talk shop with the founders? Ping us on LinkedIn or see
            the live proof-ingestion flow on the demo page.
          </p>
          <div className="mt-4 flex flex-wrap gap-3 justify-center">
            <a href="/live" className="btn btn-md btn-primary">
              See the live demo
            </a>
            <a href="/auth/vendor/signup" className="btn btn-md btn-ghost">
              Sign up as a buyer
            </a>
          </div>
        </motion.div>
      </main>
    </div>
  );
}

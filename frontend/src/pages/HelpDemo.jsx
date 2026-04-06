import { motion } from "framer-motion";
import {
  ArrowLeft,
  Shield,
  Monitor,
  Smartphone,
  Camera,
  MessageCircle,
  CheckCircle2,
  AlertTriangle,
  FileBadge,
  Users,
  LifeBuoy,
} from "lucide-react";
import WhatsAppQRBlock from "../components/landing/WhatsAppQRBlock";

const WHATSAPP_NUMBER = "+1 415 523 8886";
const WHATSAPP_NUMBER_RAW = "14155238886";
const JOIN_CODE = "crop-conversation";
const WA_LINK = `https://wa.me/${WHATSAPP_NUMBER_RAW}?text=${encodeURIComponent(`join ${JOIN_CODE}`)}`;

function SectionHeader({ icon: Icon, eyebrow, title }) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2 mb-2">
        {Icon && (
          <div className="w-7 h-7 rounded-lg bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center">
            <Icon size={14} className="text-emerald-400" />
          </div>
        )}
        <p className="text-[11px] text-emerald-400 uppercase tracking-[0.3em] font-semibold">
          {eyebrow}
        </p>
      </div>
      <h2 className="text-[24px] md:text-[30px] font-bold text-white tracking-tight leading-tight">
        {title}
      </h2>
    </div>
  );
}

function Step({ number, children }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-white/[0.05] border border-white/[0.1] flex items-center justify-center text-[13px] font-bold text-white tabular-nums">
        {number}
      </div>
      <div className="flex-1 pt-0.5 text-[14px] text-slate-300 leading-relaxed">
        {children}
      </div>
    </div>
  );
}

function QuoteBlock({ children }) {
  return (
    <blockquote className="my-4 pl-4 border-l-2 border-emerald-500/40 text-[14px] text-slate-300 italic leading-relaxed">
      {children}
    </blockquote>
  );
}

function ScreenshotBox({ label }) {
  return (
    <div className="my-5 rounded-xl border border-dashed border-white/[0.1] bg-white/[0.02] px-6 py-8 text-center">
      <Monitor size={20} className="text-slate-600 mx-auto mb-2" />
      <p className="text-[11px] text-slate-500 font-mono">[Screenshot: {label}]</p>
    </div>
  );
}

function Callout({ tone = "info", title, children }) {
  const tones = {
    info: "border-blue-500/20 bg-blue-500/5 text-blue-200",
    warn: "border-amber-500/25 bg-amber-500/5 text-amber-200",
    success: "border-emerald-500/25 bg-emerald-500/5 text-emerald-200",
  };
  return (
    <div className={`my-5 rounded-xl border px-4 py-3 text-[13px] leading-relaxed ${tones[tone]}`}>
      {title && <p className="font-semibold text-white text-[13px] mb-1">{title}</p>}
      {children}
    </div>
  );
}

export default function HelpDemo() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-400 font-sans antialiased">
      {/* Top bar */}
      <header className="border-b border-white/[0.06] bg-slate-950/70 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-[13px] text-slate-400 hover:text-white transition-colors font-medium"
          >
            <ArrowLeft size={14} />
            Back to TrustAudit
          </a>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-white flex items-center justify-center">
              <Shield size={13} className="text-slate-950" strokeWidth={2.5} />
            </div>
            <span className="text-white font-semibold text-[13px] tracking-tight hidden sm:inline">
              TrustAudit Demo Guide
            </span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-10 md:py-16">
        {/* Intro */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="mb-12"
        >
          <p className="text-[11px] text-emerald-400 uppercase tracking-[0.3em] font-semibold mb-3">
            Zoom demo walkthrough
          </p>
          <h1 className="text-[34px] md:text-[46px] font-bold text-white tracking-tight leading-[1.05] mb-5">
            The 30-second customer demo.
          </h1>
          <p className="text-[15px] md:text-[17px] text-slate-400 leading-relaxed max-w-2xl">
            This page is written so a person with zero technical skills — the
            Indian MSME conglomerate CFO on your Zoom call — can follow it
            aloud on their own phone. Read each step out loud and do exactly
            what it says.
          </p>
        </motion.div>

        {/* WhatsApp panel */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="glass rounded-2xl p-6 md:p-8 mb-16"
          style={{
            boxShadow:
              "0 20px 60px -20px rgba(16,185,129,0.2), inset 0 0 0 1px rgba(255,255,255,0.04)",
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-5 gap-6 items-center">
            <div className="md:col-span-3">
              <p className="text-[10px] text-emerald-400 uppercase tracking-[0.18em] font-semibold mb-2">
                WhatsApp Sandbox
              </p>
              <p className="text-[32px] md:text-[38px] font-bold tabular-nums text-white tracking-tight leading-none">
                {WHATSAPP_NUMBER}
              </p>
              <p className="mt-3 text-[13px] text-slate-400">
                Send{" "}
                <code className="px-1.5 py-0.5 rounded bg-white/[0.06] text-emerald-300 font-mono text-[12px]">
                  join {JOIN_CODE}
                </code>{" "}
                as your first message.
              </p>
              <a
                href={WA_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 inline-flex items-center gap-2 px-5 h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[13px] tracking-tight transition-all shadow-[0_10px_30px_-10px_rgba(16,185,129,0.6)]"
              >
                <MessageCircle size={15} strokeWidth={2.4} />
                Open WhatsApp
              </a>
            </div>
            <div className="md:col-span-2 flex justify-center">
              <WhatsAppQRBlock waLink={WA_LINK} size={180} />
            </div>
          </div>
        </motion.div>

        {/* Section: Setup */}
        <section className="mb-16">
          <SectionHeader
            icon={Monitor}
            eyebrow="Setup (5 minutes before the Zoom)"
            title="Prep your browser and shared screen."
          />
          <div className="space-y-5">
            <Step number="1">
              Open Google Chrome. Go to{" "}
              <code className="px-1.5 py-0.5 rounded bg-white/[0.06] text-emerald-300 font-mono text-[12px]">
                https://trustaudit.onrender.com
              </code>
              . The landing page should load in under 2 seconds with a glowing
              shield in the middle.
            </Step>
            <ScreenshotBox label="Landing page with glowing shield hero" />
            <Step number="2">
              In the page, find the big card that says{" "}
              <strong className="text-white">"Try it live right now"</strong>.
              Click <strong className="text-white">"New session"</strong> on
              the <code className="font-mono text-emerald-300">/live</code>{" "}
              dashboard. This creates a unique session ID and shows you two
              things: a WhatsApp deep link and a public URL to{" "}
              <code className="font-mono text-emerald-300">/live?session=&lt;id&gt;</code>.
            </Step>
            <Step number="3">
              Open a second Chrome tab. Paste the public live URL. This is the
              "shared watch screen" — the dashboard everyone on the Zoom will
              see live.
            </Step>
            <ScreenshotBox label="Live dashboard — empty state with session banner" />
            <Step number="4">
              Share your Chrome window on the Zoom call so everyone sees the{" "}
              <code className="font-mono text-emerald-300">/live</code>{" "}
              dashboard, not your desktop.
            </Step>
            <Step number="5">
              Copy the WhatsApp deep link into the Zoom chat. Paste it. Tell
              everyone: <em>"Tap this link on your phone to start."</em>
            </Step>
          </div>
        </section>

        {/* Part 1 — explain */}
        <section className="mb-16">
          <SectionHeader
            icon={Users}
            eyebrow="Part 1 — Explain the screen (60 seconds)"
            title="Tell the Zoom audience what they're looking at."
          />
          <p className="text-[14px] text-slate-300 mb-2">Read this out loud:</p>
          <QuoteBlock>
            "What you're seeing on the shared screen is TrustAudit's live
            public demo dashboard. Every time anyone sends a challan photo to
            our WhatsApp bot, it lands here in real time. The status pills on
            the right tell you whether each document is pending, being
            processed, verified, or ready to submit to the government under
            Section 43B(h). The confidence bar tells you how sure our vision
            model is about the extracted fields."
          </QuoteBlock>
        </section>

        {/* Part 2 — customer sends challan */}
        <section className="mb-16">
          <SectionHeader
            icon={Smartphone}
            eyebrow="Part 2 — Customer sends a challan (2 minutes)"
            title="Walk the customer through their phone."
          />
          <p className="text-[14px] text-slate-300 mb-2">Read this out loud to the customer:</p>
          <QuoteBlock>
            "On your phone right now, please do these three things. Take your
            time. I'll walk you through each one."
          </QuoteBlock>
          <div className="space-y-5">
            <Step number="1">
              <em>"Open WhatsApp on your phone."</em>
            </Step>
            <Step number="2">
              <em>
                "Tap the link I just pasted in the Zoom chat. This will open a
                chat with our TrustAudit bot and pre-fill a message. Tap the
                Send arrow."
              </em>
            </Step>
            <Step number="3">
              <em>
                "You should see a reply from the bot within about 5 seconds
                saying 'Welcome — send us a photo of any delivery challan.'
                Say 'yes' when you see it."
              </em>
            </Step>
            <Step number="4">
              <em>(wait for confirmation)</em>
            </Step>
            <Step number="5">
              <em>
                "Great. Now tap the paperclip or camera icon in the chat, pick
                any photo of a delivery challan or goods-receipt note from
                your gallery, and send it. If you don't have one, use the
                photo I just sent you in the Zoom chat — it's called{" "}
              </em>
              <code className="px-1.5 py-0.5 rounded bg-white/[0.06] text-emerald-300 font-mono text-[12px]">
                perfect_tally_printed.jpg
              </code>
              <em>."</em>
            </Step>
            <Step number="6">
              <em>
                "The bot will reply 'Received — processing' within 2 seconds.
                Say 'got it' when you see that reply."
              </em>
            </Step>
          </div>

          <Callout tone="info" title="Now switch your voice to narrating the shared screen:">
            <em>
              "Watch the screen. You should see a new row appear, flashing
              amber — that's the VERIFYING state. Our vision model is reading
              the photo right now."
            </em>
          </Callout>
          <ScreenshotBox label="Live dashboard — row in VERIFYING (amber) state" />
          <p className="text-[13px] text-slate-400 italic mb-2">(pause 5–10 seconds — the row transitions)</p>
          <QuoteBlock>
            "There — the row just turned green and VERIFIED. The confidence
            bar reads 94%. All four fields were extracted: the Date of
            Acceptance, the GSTIN, the amount, and the invoice number. On
            your phone, you should also see a WhatsApp reply from the bot
            confirming the extraction."
          </QuoteBlock>
          <ScreenshotBox label="Live dashboard — row transitioned to VERIFIED (green) with 94% confidence" />
        </section>

        {/* Part 3 — PDF */}
        <section className="mb-16">
          <SectionHeader
            icon={FileBadge}
            eyebrow="Part 3 — Show the 43B(h) form (1 minute)"
            title="Open the government-ready PDF."
          />
          <div className="space-y-5">
            <Step number="1">On the shared screen, click the new green row.</Step>
            <Step number="2">
              A detail panel slides in from the right showing the photo the
              customer just sent, the audit trail, and the extracted fields.
            </Step>
            <Step number="3">
              Click the <strong className="text-white">"View 43B(h) Form"</strong>{" "}
              button at the top of the panel.
            </Step>
            <Step number="4">A government-style PDF opens in a new Zoom-visible tab.</Step>
          </div>
          <ScreenshotBox label="43B(h) PDF — letterhead, MSME details, audit trail, QR authenticity stamp" />
          <p className="text-[14px] text-slate-300 mt-4 mb-2">Read this out loud:</p>
          <QuoteBlock>
            "This is a fully formatted Section 43B(h) compliance form,
            generated in under 2 seconds from the photo we just received. It
            has the letterhead, the reporting entity, the MSME supplier
            details, the critical dates for the 45-day deadline, the
            confidence score from our vision model, a full audit trail of
            every processing step, and a QR code at the bottom that any tax
            officer can scan to verify authenticity. This form is ready to
            submit alongside your company's ITR filing under Schedule BP."
          </QuoteBlock>
        </section>

        {/* Part 4 — edge case */}
        <section className="mb-16">
          <SectionHeader
            icon={AlertTriangle}
            eyebrow="Part 4 — Edge case (2 minutes)"
            title="Prove that the model flags — not guesses — missing fields."
          />
          <p className="text-[14px] text-slate-300 mb-2">Read this out loud to the customer:</p>
          <QuoteBlock>
            "Now let's test what happens when the photo isn't perfect. Please
            send the second photo I pasted in the Zoom chat — it's called{" "}
            <code className="not-italic px-1.5 py-0.5 rounded bg-white/[0.06] text-emerald-300 font-mono text-[12px]">
              missing_date.jpg
            </code>
            . The date on it is smudged intentionally."
          </QuoteBlock>
          <p className="text-[13px] text-slate-400 italic mb-3">(wait for customer to send)</p>
          <p className="text-[14px] text-slate-300 mb-2">Narrate the shared screen:</p>
          <QuoteBlock>
            "Watch: the row appears, turns amber, and this time it stays
            amber with a label that says NEEDS INFO. Our vision model
            noticed the date was unreadable and didn't guess — it flagged
            it. On your phone, you should have just received a WhatsApp
            reply asking specifically for the missing date. Can you read me
            what the bot said?"
          </QuoteBlock>
          <ScreenshotBox label="Live dashboard — NEEDS_INFO row with WhatsApp reply bubble" />
          <p className="text-[13px] text-slate-400 italic mb-3">(customer reads the rebut message)</p>
          <QuoteBlock>
            "Right — the bot asked for exactly the missing piece. This is
            critical because 43B(h) disallowance is binary: if you're one
            day late, you lose the entire deduction. You cannot ship a
            guessed date on a compliance form. Now please reply in WhatsApp
            with the text:{" "}
            <code className="not-italic px-1.5 py-0.5 rounded bg-white/[0.06] text-emerald-300 font-mono text-[12px]">
              21-03-2026
            </code>
            "
          </QuoteBlock>
          <p className="text-[13px] text-slate-400 italic mb-3">(wait)</p>
          <QuoteBlock>
            "Watch the screen — the row should turn green now. The audit
            trail on the form will record that this field came from a
            driver text correction, not vision extraction. All documented,
            all defensible."
          </QuoteBlock>
        </section>

        {/* Part 5 — Vendor dashboard */}
        <section className="mb-16">
          <SectionHeader
            icon={CheckCircle2}
            eyebrow="Part 5 — Vendor dashboard (optional, 2 minutes)"
            title="Switch to the authenticated CFO view."
          />
          <Step number="1">
            Switch your shared screen from{" "}
            <code className="font-mono text-emerald-300">/live</code> to{" "}
            <code className="font-mono text-emerald-300">
              /auth/vendor/signin
            </code>
            . Click the <strong className="text-white">"Try the demo"</strong>{" "}
            dropdown and pick{" "}
            <code className="font-mono text-emerald-300">cfo@bharat.demo</code>.
          </Step>
          <p className="text-[14px] text-slate-300 mt-4 mb-2">Read this out loud:</p>
          <QuoteBlock>
            "This is what the enterprise CFO sees in production. 50 active
            invoices, real GSTINs across 10 states, live state transitions,
            loss analytics, dispute queue, and every invoice the customer just
            created via WhatsApp is also visible here. The numbers at the top
            — Portfolio ₹X, Saved ₹Y, At Risk ₹Z — update live. Every row is
            one tap away from the same 43B(h) form we just generated."
          </QuoteBlock>
          <ScreenshotBox label="Vendor CFO dashboard — 50 invoices across 10 states with live totals" />
        </section>

        {/* Part 6 — Close */}
        <section className="mb-16">
          <SectionHeader
            icon={Camera}
            eyebrow="Part 6 — Close (1 minute)"
            title="Land the closing narrative."
          />
          <QuoteBlock>
            "Everything you just saw was running through the real pipeline: a
            photo sent over WhatsApp, processed by a vision model in under 2
            seconds, state-machined to VERIFIED or NEEDS_INFO, converted to a
            government-ready PDF, and served in real time over server-sent
            events to a dashboard your CFO can log into right now with email,
            Google, Facebook, or WhatsApp OTP. We built this specifically for
            the way Indian MSME supply chains actually work — paper challans,
            WhatsApp photos, and CFOs who can't miss the 45-day deadline. What
            questions do you have?"
          </QuoteBlock>
        </section>

        {/* Troubleshooting */}
        <section className="mb-10">
          <SectionHeader
            icon={LifeBuoy}
            eyebrow="If something breaks"
            title="Troubleshooting during the Zoom demo."
          />
          <div className="space-y-4">
            <Callout tone="warn" title="Nothing shows up on /live after the customer sends a photo">
              Click the small green "Live" dot at the top-right of the
              dashboard — it's the SSE connection indicator. If it's red,
              click "New session" and try again. Worst case, the 2-second
              polling fallback kicks in automatically within 2 seconds. If
              still nothing, ask the customer to resend.
            </Callout>
            <Callout tone="warn" title="The WhatsApp bot doesn't reply">
              Check the provider health endpoint at{" "}
              <code className="font-mono text-emerald-300">/api/demo/health</code>
              . It shows which WhatsApp provider is live and its last
              successful message timestamp. If Twilio is down, it auto-
              switches to baileys. If both are down, switch to mock mode and
              drag a fixture image into the mock panel on-screen.
            </Callout>
            <Callout tone="warn" title="The customer's phone won't open the wa.me link">
              Tell them to open WhatsApp manually, search{" "}
              <strong className="text-white">+1 415 523 8886</strong>, open
              the chat, and type{" "}
              <code className="font-mono text-emerald-300">join {JOIN_CODE}</code>{" "}
              as the first message. Wait for the reply confirming sandbox
              join, then send the photo.
            </Callout>
            <Callout tone="warn" title="You can't screen-share your browser">
              Have the customer open{" "}
              <code className="font-mono text-emerald-300">
                https://trustaudit.onrender.com/live?session=&lt;their-session-id&gt;
              </code>{" "}
              directly on their own laptop. The link is in the Zoom chat.
            </Callout>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/[0.06] bg-slate-950/60 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 py-6 flex flex-col md:flex-row items-center justify-between gap-2 text-[11px] text-slate-600">
          <span>TrustAudit demo guide · updated continuously</span>
          <div className="flex items-center gap-4">
            <a href="/" className="hover:text-white transition-colors">
              Home
            </a>
            <a href="/live" className="hover:text-white transition-colors">
              /live
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

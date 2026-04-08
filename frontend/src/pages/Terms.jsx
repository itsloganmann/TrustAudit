/**
 * Terms of Service — TrustAudit.
 *
 * LEGAL NOTICE: This is a TEMPLATE drafted to be a reasonable starting
 * point for an Indian SaaS contract. It has NOT been reviewed by a
 * lawyer. Before onboarding real customers, engage a competent Indian
 * lawyer to review and sign off on this file. Key risks to surface in
 * that review:
 *   - limitation-of-liability enforceability under the Indian Contract
 *     Act, 1872
 *   - AI-output accuracy disclaimers (Gemini-read fields)
 *   - WhatsApp integration risk — we use an unofficial multi-device
 *     WhatsApp Web client (Baileys), which may be terminated by Meta
 *     at any time. See PRODUCTION_READINESS.md for the migration path.
 *
 * All runtime-configurable values (company name, grievance officer,
 * jurisdiction city) live in frontend/src/config/legal.js and are
 * backed by VITE_LEGAL_* build-time env vars.
 */
import { Link } from "react-router-dom";
import { Shield, ArrowLeft, AlertTriangle } from "lucide-react";
import LEGAL, { hasUnresolvedLegalFields } from "../config/legal.js";

export default function Terms() {
  const unresolved = hasUnresolvedLegalFields();
  return (
    <div className="min-h-screen bg-[#06070f] text-violet-100/70 font-sans antialiased">
      <header className="sticky top-0 z-50 border-b border-violet-500/10 bg-[#06070f]/80 backdrop-blur-2xl">
        <div className="max-w-4xl mx-auto px-8 h-20 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-gradient-to-br from-violet-400 via-fuchsia-400 to-amber-300 flex items-center justify-center">
              <Shield size={18} className="text-[#06070f]" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <span className="aurora-headline text-[22px] text-white leading-none">
                {LEGAL.companyName}
              </span>
              <span className="font-mono text-[9px] text-violet-300/70 tracking-[0.3em] uppercase mt-0.5">
                Terms of Service
              </span>
            </div>
          </Link>
          <Link
            to="/"
            className="btn btn-md btn-ghost inline-flex items-center gap-2"
          >
            <ArrowLeft size={14} />
            Back to home
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-8 py-16">
        <article className="prose-dark space-y-6">
          <div>
            <h1 className="text-[40px] font-bold text-white tracking-tight leading-tight mb-2">
              Terms of Service
            </h1>
            <p className="text-[13px] text-violet-300/60">
              Last updated: {LEGAL.termsLastUpdated}
            </p>
          </div>

          {unresolved && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 my-4 text-amber-100">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-300" />
              <div className="text-[13px] leading-relaxed">
                <p className="font-semibold text-amber-200 mb-1">
                  This deployment is running with placeholder legal fields.
                </p>
                <p>
                  Some identity or jurisdiction values are still marked{" "}
                  <code className="text-amber-200">TODO_LEGAL</code>. Set the
                  matching <code className="text-amber-200">VITE_LEGAL_*</code>{" "}
                  env vars in Render before accepting paid customers. See{" "}
                  <code className="text-amber-200">PRODUCTION_READINESS.md</code>.
                </p>
              </div>
            </div>
          )}

          <Section title="1. Agreement to these Terms">
            <p>
              These Terms of Service ("Terms") are a legal agreement
              between you ("you", "customer", or "user") and{" "}
              {LEGAL.companyLegalName} ("{LEGAL.companyName}", "we", "us")
              governing your access to and use of the{" "}
              {LEGAL.companyName} software service (the "Service"),
              including the web dashboard, the WhatsApp integration, and
              all associated APIs.
            </p>
            <p>
              By creating an account, sending a WhatsApp message to our
              service number, or otherwise accessing the Service, you
              agree to these Terms. If you do not agree, do not use the
              Service.
            </p>
          </Section>

          <Section title="2. What the Service does">
            <p>
              {LEGAL.companyName} is a compliance dashboard for Indian
              small and medium businesses that tracks the 45-day payment
              deadline under Section 43B(h) of the Income Tax Act, 1961.
              We ingest photos of paper delivery challans and supplier
              invoices that you or your team send us on WhatsApp, read
              the structured fields using a third-party vision model
              (Google Gemini), and present them on your dashboard with a
              running deadline timer.
            </p>
            <p>
              <strong>We are not a chartered accountant, tax advisor, or
              law firm.</strong> Our outputs are decision-support data,
              not legal or tax advice. You are responsible for filing
              your own returns and for the accuracy of any data you
              submit to Indian tax authorities.
            </p>
          </Section>

          <Section title="3. AI-read fields are computed, not audited">
            <p>
              The vendor name, GSTIN, amount, invoice number, and
              acceptance date fields on your dashboard are <strong>
              extracted by a large language model</strong> from the
              photos you send. Large language models are probabilistic
              and can make mistakes, especially on low-light, rotated,
              or smudged bills.
            </p>
            <p>
              We surface a per-field confidence score and mark any field
              below our threshold as <strong>NEEDS REVIEW</strong>. It
              is your responsibility — and the responsibility of your
              CA or accounts team — to review every entry before relying
              on it for a tax filing. {LEGAL.companyName} is not liable
              for filings made on unreviewed AI-extracted data.
            </p>
          </Section>

          <Section title="4. Account creation and authentication">
            <p>
              To use the dashboard you must create an account. You may
              sign up using Google OAuth or an email magic link. You must
              provide accurate information, keep your credentials secure,
              and notify us immediately of any unauthorized access.
            </p>
            <p>
              You are responsible for all activity under your account.
              We may suspend or terminate any account we believe has
              been compromised, is being used fraudulently, or is
              otherwise in breach of these Terms.
            </p>
          </Section>

          <Section title="5. Acceptable use">
            <p>When using the Service you agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                Upload content you do not have the right to upload,
                including photos of bills that belong to a business you
                are not authorised to act on behalf of.
              </li>
              <li>
                Reverse-engineer, scrape, or attempt to bypass rate
                limits, authentication, or our WhatsApp integration.
              </li>
              <li>
                Attempt to use the Service to transmit malware, phishing
                payloads, or unlawful content.
              </li>
              <li>
                Use the Service in a way that interferes with or
                disrupts the experience of other customers.
              </li>
              <li>
                Use the Service to process personal data of children
                under 18 or any "sensitive personal data" (as defined
                by Indian law) without our prior written consent.
              </li>
            </ul>
            <p>
              We reserve the right to throttle, suspend, or terminate
              access without notice if we believe you are violating
              this section.
            </p>
          </Section>

          <Section title="6. WhatsApp integration disclaimer">
            <p>
              The Service connects to WhatsApp using a third-party
              library that interacts with the consumer WhatsApp Web
              protocol. WhatsApp and Meta Platforms, Inc. may, at their
              sole discretion, block, throttle, or terminate the service
              number at any time. We do not control that decision and
              cannot guarantee continuous WhatsApp availability.
            </p>
            <p>
              If the WhatsApp integration is unavailable, the web
              dashboard remains accessible for reviewing previously
              ingested bills and generating compliance PDFs.
            </p>
          </Section>

          <Section title="7. Fees and billing">
            <p>
              {LEGAL.companyName} is offered under a subscription model.
              Pricing, billing frequency, and included usage limits are
              described on our pricing page at the time of signup.
              All fees are quoted in Indian Rupees (INR) and are
              exclusive of applicable GST.
            </p>
            <p>
              If you are on a paid plan, you authorise us to charge
              your payment method at the start of each billing period.
              Failed payments may result in suspension of service after
              a 7-day grace period.
            </p>
            <p>
              All fees are non-refundable except where required by
              applicable Indian consumer-protection law.
            </p>
          </Section>

          <Section title="8. Intellectual property">
            <p>
              The Service — including the codebase, dashboard, brand
              assets, and documentation — is the exclusive property of{" "}
              {LEGAL.companyLegalName}. We grant you a limited,
              revocable, non-exclusive, non-transferable licence to use
              the Service for your internal business purposes during
              your subscription period.
            </p>
            <p>
              You retain ownership of the photos and bill content you
              upload. By uploading, you grant us a limited licence to
              process that content for the purposes described in the
              Privacy Policy.
            </p>
          </Section>

          <Section title="9. Warranty disclaimer">
            <p className="uppercase tracking-wide text-[13px] text-violet-100/60">
              The Service is provided "as is" and "as available" without
              warranties of any kind, whether express, implied,
              statutory, or otherwise. To the maximum extent permitted
              by applicable Indian law, we disclaim all implied
              warranties of merchantability, fitness for a particular
              purpose, non-infringement, and uninterrupted or error-free
              operation.
            </p>
            <p>
              We do not warrant that the AI-extracted fields will be
              accurate, that the deadline calculations will be
              error-free, or that the Service will be available without
              interruption. You rely on the Service at your own risk.
            </p>
          </Section>

          <Section title="10. Limitation of liability">
            <p>
              To the maximum extent permitted by applicable Indian law,
              in no event shall {LEGAL.companyName}, its officers,
              directors, employees, or agents be liable for any
              indirect, incidental, special, consequential, punitive,
              or exemplary damages, including lost profits, lost data,
              lost tax deductions, regulatory penalties, or goodwill
              arising out of or in connection with your use of the
              Service.
            </p>
            <p>
              Our aggregate liability for any claim arising out of or
              in connection with these Terms or the Service shall not
              exceed the lesser of (a) the total fees you paid to us
              in the twelve months preceding the claim, or (b) ten
              thousand Indian Rupees (₹10,000).
            </p>
            <p>
              Nothing in these Terms excludes liability that cannot be
              excluded under applicable Indian law (including liability
              for fraud or wilful misconduct).
            </p>
          </Section>

          <Section title="11. Indemnity">
            <p>
              You agree to indemnify, defend, and hold harmless{" "}
              {LEGAL.companyName} from any claim, liability, loss, or
              expense (including reasonable legal fees) arising out of:
              (a) your breach of these Terms, (b) your misuse of the
              Service, (c) your violation of any applicable law, or
              (d) your violation of any third-party right, including any
              intellectual-property or privacy right.
            </p>
          </Section>

          <Section title="12. Termination">
            <p>
              Either party may terminate your account at any time. You
              may close your account via the dashboard or by emailing{" "}
              <a
                href={`mailto:${LEGAL.supportEmail}`}
                className="text-violet-300 hover:text-white"
              >
                {LEGAL.supportEmail}
              </a>
              . We may terminate or suspend your account immediately,
              with or without notice, for any breach of these Terms.
            </p>
            <p>
              On termination, your access to the dashboard ends and we
              delete your personal data in accordance with the Privacy
              Policy, subject to legal record-retention obligations.
            </p>
          </Section>

          <Section title="13. Changes to the Service and these Terms">
            <p>
              We may change the Service or these Terms from time to
              time. Material changes will be announced by email to
              registered users at least 15 days before they take
              effect. Continued use of the Service after the change
              takes effect constitutes acceptance of the new Terms.
            </p>
          </Section>

          <Section title="14. Governing law and jurisdiction">
            <p>
              These Terms are governed by the laws of India. Any
              dispute arising out of or in connection with these Terms
              or the Service will be subject to the exclusive
              jurisdiction of the courts at {LEGAL.jurisdictionCity},
              India.
            </p>
          </Section>

          <Section title="15. Dispute resolution">
            <p>
              Before escalating any dispute to court, you agree to
              first contact us at{" "}
              <a
                href={`mailto:${LEGAL.supportEmail}`}
                className="text-violet-300 hover:text-white"
              >
                {LEGAL.supportEmail}
              </a>{" "}
              so we have a reasonable opportunity to resolve it
              informally. If the dispute relates to the processing of
              your personal data, you may also contact our Grievance
              Officer at{" "}
              <a
                href={`mailto:${LEGAL.grievanceOfficerEmail}`}
                className="text-violet-300 hover:text-white"
              >
                {LEGAL.grievanceOfficerEmail}
              </a>{" "}
              or escalate to the Data Protection Board of India.
            </p>
          </Section>

          <Section title="16. Contact">
            <p>
              {LEGAL.companyLegalName}
              <br />
              {LEGAL.registeredAddress}
              <br />
              Email:{" "}
              <a
                href={`mailto:${LEGAL.supportEmail}`}
                className="text-violet-300 hover:text-white"
              >
                {LEGAL.supportEmail}
              </a>
            </p>
          </Section>
        </article>
      </main>

      <footer className="border-t border-violet-500/10 mt-20 py-8">
        <div className="max-w-4xl mx-auto px-8 text-center text-[12px] text-violet-300/50">
          <p>
            &copy; {new Date().getFullYear()} {LEGAL.companyName} ·{" "}
            <Link to="/privacy" className="hover:text-white">
              Privacy Policy
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}

function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-[22px] font-semibold text-white tracking-tight mt-8">
        {title}
      </h2>
      <div className="text-[15px] leading-relaxed text-violet-100/75 space-y-3">
        {children}
      </div>
    </section>
  );
}

/**
 * Privacy Policy — TrustAudit.
 *
 * LEGAL NOTICE: This is a TEMPLATE drafted to satisfy the minimum fields
 * the Indian Digital Personal Data Protection Act 2023 ("DPDP Act") and
 * its draft Rules require a Data Fiduciary to publish. It has NOT been
 * reviewed by a lawyer. Before onboarding real customers, engage a
 * DPDP-competent Indian lawyer to review and sign off on this file.
 *
 * All runtime-configurable values (company name, grievance officer,
 * address, jurisdiction city) live in frontend/src/config/legal.js and
 * are backed by VITE_LEGAL_* build-time env vars. See
 * PRODUCTION_READINESS.md at the repo root for the full checklist of
 * what must be resolved before this file is customer-safe.
 */
import { Link } from "react-router-dom";
import { Shield, ArrowLeft, AlertTriangle } from "lucide-react";
import LEGAL, { hasUnresolvedLegalFields } from "../config/legal.js";

export default function Privacy() {
  const unresolved = hasUnresolvedLegalFields();
  return (
    <div className="min-h-screen bg-white text-zinc-700 font-sans antialiased">
      <header className="sticky top-0 z-50 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="max-w-4xl mx-auto px-8 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-zinc-900 flex items-center justify-center">
              <Shield size={16} className="text-white" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col">
              <span className="text-zinc-900 font-semibold text-[17px] tracking-tight leading-none">
                {LEGAL.companyName}
              </span>
              <span className="text-[10px] text-zinc-500 tracking-wide mt-0.5">
                Privacy Policy
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
        <article className="space-y-6">
          <div>
            <h1 className="text-[40px] font-bold text-zinc-900 tracking-tight leading-tight mb-2">
              Privacy Policy
            </h1>
            <p className="text-[13px] text-zinc-500">
              Last updated: {LEGAL.privacyLastUpdated}
            </p>
          </div>

          {unresolved && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 my-4 text-amber-800">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" />
              <div className="text-[13px] leading-relaxed">
                <p className="font-semibold text-amber-800 mb-1">
                  TrustAudit is in a pre-incorporation pilot.
                </p>
                <p>
                  Registration, grievance officer, and jurisdiction details
                  will be updated once the legal entity is formed and DPDP
                  Rule 5(9) appointments are finalised. Until then, reach
                  the founders at{" "}
                  <a
                    href="mailto:privacy@trustaudit.in"
                    className="underline text-amber-900"
                  >
                    privacy@trustaudit.in
                  </a>.
                </p>
              </div>
            </div>
          )}

          <Section title="1. Who we are">
            <p>
              {LEGAL.companyName} ("we", "us", "our") is a software service
              that helps Indian AP teams at enterprises determine which
              supplier invoices are actually safe to pay. We ingest delivery
              and acceptance proof (WhatsApp messages, photos, PDFs, PODs,
              GRNs, stamped paperwork), match it to the right invoice, and
              return a verdict (clear to claim, disputed, or missing proof).
              One use case of that decision layer is tracking the 45-day
              payment window under Section 43B(h) of the Income Tax Act,
              1961.
            </p>
            <p>
              <strong>Data Fiduciary (company):</strong>{" "}
              {LEGAL.companyLegalName}
            </p>
            <p>
              <strong>Registration:</strong> {LEGAL.companyRegistration}
            </p>
            <p>
              <strong>Registered address:</strong> {LEGAL.registeredAddress}
            </p>
            <p>
              <strong>Contact email:</strong>{" "}
              <a
                href={`mailto:${LEGAL.privacyEmail}`}
                className="text-emerald-700 hover:text-emerald-800"
              >
                {LEGAL.privacyEmail}
              </a>
            </p>
          </Section>

          <Section title="2. What we collect">
            <p>
              We collect only what we need to run the service. Nothing more.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Account data:</strong> your name, email, role (CFO,
                accountant, driver), company name, password hash, and the
                OAuth identifier if you sign in with Google.
              </li>
              <li>
                <strong>Bill content:</strong> photos of paper delivery
                challans your team sends over WhatsApp; the vendor name,
                GSTIN, amount, invoice number, acceptance date, and 45-day
                deadline our system reads from those photos; and the sender's
                phone number.
              </li>
              <li>
                <strong>Operational metadata:</strong> timestamps, IP
                addresses, session cookies, and the usual web-server access
                logs, kept for security and debugging.
              </li>
            </ul>
            <p>
              We do <strong>not</strong> collect Aadhaar, PAN, or any
              biometric data. We do <strong>not</strong> track you across
              other websites. We do <strong>not</strong> sell your data.
            </p>
          </Section>

          <Section title="3. Why we collect it">
            <p>Your data is processed only for the following purposes:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>To read paper bills and put them on your dashboard.</li>
              <li>
                To calculate the 45-day deadline under Section 43B(h) and
                alert you before it passes.
              </li>
              <li>To generate compliance PDFs your CA can file.</li>
              <li>To let you sign in and keep your session secure.</li>
              <li>To send you WhatsApp replies about bills you submitted.</li>
              <li>
                To investigate abuse, fraud, or security incidents, and to
                comply with lawful requests from Indian authorities.
              </li>
            </ul>
          </Section>

          <Section title="4. Legal basis for processing">
            <p>
              Under Section 6 of the DPDP Act we rely on the following
              lawful bases to process your personal data:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Consent</strong> — you affirmatively sign up for an
                account or send a WhatsApp message to our service number,
                both of which constitute free, specific, informed, and
                unambiguous consent to the processing described here.
              </li>
              <li>
                <strong>Legitimate uses</strong> — security monitoring,
                fraud prevention, and complying with lawful orders from
                Indian authorities.
              </li>
            </ul>
            <p>
              You can withdraw consent at any time by emailing{" "}
              <a
                href={`mailto:${LEGAL.privacyEmail}`}
                className="text-emerald-700 hover:text-emerald-800"
              >
                {LEGAL.privacyEmail}
              </a>
              . Withdrawal does not affect the lawfulness of processing
              that happened before withdrawal.
            </p>
          </Section>

          <Section title="5. Who we share it with">
            <p>
              We share the minimum amount of data with the following service
              providers so the product can work. Each of them is a separate
              Data Processor under the DPDP Act and is contractually bound
              to process data only on our instructions.
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Google (Gemini vision API)</strong> — to read the
                text fields on the bill photos you send. Photos are sent
                over HTTPS, processed in-memory, and not retained by Google
                for training per the paid-tier Gemini API terms.
              </li>
              <li>
                <strong>Render Inc.</strong> — cloud host for our web
                service and Postgres database. Data is stored in{" "}
                {LEGAL.hostingRegion}. See "Cross-border transfers" below.
              </li>
              <li>
                <strong>Resend</strong> — transactional email (magic-link
                sign-in and account notifications). Resend receives the
                recipient email address and the email body only.
              </li>
              <li>
                <strong>WhatsApp / Meta</strong> — WhatsApp itself stores
                the messages you send to us per its own privacy policy.
                We do not control that storage.
              </li>
            </ul>
            <p>
              We do not share your data with advertisers, data brokers, or
              third-party analytics services.
            </p>
          </Section>

          <Section title="6. How long we keep it">
            <p>
              We keep bill records and invoices for as long as you maintain
              an active account, plus seven years after account closure —
              this matches the Income Tax Act record-retention requirement
              for Indian businesses.
            </p>
            <p>
              Session cookies expire 30 days after sign-in. Server access
              logs are kept for 90 days and then deleted. Raw challan image
              uploads are retained for two years so your CA can reconcile
              against the original evidence; after two years only the
              extracted structured fields remain.
            </p>
            <p>
              If you delete your account, we delete your personal data
              within 30 days except for records we are legally required
              to retain (tax records, ongoing fraud investigations).
            </p>
          </Section>

          <Section title="7. Your rights as a Data Principal">
            <p>Under the DPDP Act 2023, you have the right to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Access</strong> — ask us for a copy of the personal
                data we hold about you.
              </li>
              <li>
                <strong>Correct</strong> — ask us to correct inaccurate or
                incomplete data.
              </li>
              <li>
                <strong>Erase</strong> — ask us to delete your personal
                data, subject to our legal retention obligations.
              </li>
              <li>
                <strong>Grievance redressal</strong> — raise a complaint
                with our Grievance Officer (contact below). If we do not
                resolve it within the statutory timeline, you may escalate
                to the Data Protection Board of India.
              </li>
              <li>
                <strong>Nominate</strong> — designate another person to
                exercise your rights on your behalf in the event of your
                death or incapacity.
              </li>
            </ul>
            <p>
              To exercise any of these rights, email{" "}
              <a
                href={`mailto:${LEGAL.privacyEmail}`}
                className="text-emerald-700 hover:text-emerald-800"
              >
                {LEGAL.privacyEmail}
              </a>
              . We will respond within 30 days.
            </p>
          </Section>

          <Section title="8. Grievance Officer">
            <p>
              Per Rule 5(9) of the draft DPDP Rules, our Grievance Officer is:
            </p>
            <div className="rounded-xl p-5 my-4 bg-zinc-50 border border-zinc-200">
              <p className="text-zinc-900 font-semibold">
                {LEGAL.grievanceOfficerName}
              </p>
              <p className="text-[13px]">
                Email:{" "}
                <a
                  href={`mailto:${LEGAL.grievanceOfficerEmail}`}
                  className="text-emerald-700 hover:text-emerald-800"
                >
                  {LEGAL.grievanceOfficerEmail}
                </a>
              </p>
              <p className="text-[13px]">
                Phone: {LEGAL.grievanceOfficerPhone}
              </p>
              <p className="text-[13px]">
                Address: {LEGAL.grievanceOfficerAddress}
              </p>
            </div>
            <p>
              The Grievance Officer will acknowledge your complaint within
              24 hours and resolve it within the statutory timeline set by
              the DPDP Rules.
            </p>
          </Section>

          <Section title="9. Security">
            <p>
              We protect your data with industry-standard controls:
              TLS/HTTPS for every connection, bcrypt password hashing,
              session tokens signed with a strong secret, least-privilege
              database access, encrypted Postgres at rest (managed by
              Render), and rate-limited public endpoints. We do not
              guarantee absolute security — nobody can — but we take
              reasonable steps and, in the event of a personal-data breach
              that is likely to result in risk to you, we will notify you
              and the Data Protection Board of India without undue delay
              and in any case within 72 hours of becoming aware of it.
            </p>
          </Section>

          <Section title="10. Cross-border data transfers">
            <p>
              Our cloud infrastructure currently runs in {LEGAL.hostingRegion}.
              By using {LEGAL.companyName} you consent to your personal data
              being processed outside India under the safeguards described
              in this policy. We will not transfer your data to any country
              the Central Government has notified as restricted under
              Section 16 of the DPDP Act.
            </p>
            <p>
              Planned migration: {LEGAL.plannedHostingRegion}. We will
              update this policy and notify registered users before the
              migration completes.
            </p>
          </Section>

          <Section title="11. Children">
            <p>
              {LEGAL.companyName} is a business product. It is not intended
              for children under 18 and we do not knowingly collect data
              from children. Under Section 9 of the DPDP Act we do not
              process children's data for targeted advertising, behavioural
              monitoring, or tracking. If you believe a child has signed
              up, contact us and we will delete the account.
            </p>
          </Section>

          <Section title="12. Changes to this policy">
            <p>
              We may update this policy from time to time. Material
              changes will be announced by email to registered users at
              least 15 days before they take effect. The "Last updated"
              date at the top of this page always reflects the current
              version.
            </p>
          </Section>

          <Section title="13. Jurisdiction">
            <p>
              This policy is governed by the laws of India. Any dispute
              arising out of or in connection with it will be subject to
              the exclusive jurisdiction of the courts at{" "}
              {LEGAL.jurisdictionCity}, India.
            </p>
          </Section>
        </article>
      </main>

      <footer className="border-t border-zinc-200 mt-20 py-8">
        <div className="max-w-4xl mx-auto px-8 text-center text-[12px] text-zinc-500">
          <p>
            &copy; {new Date().getFullYear()} {LEGAL.companyName} ·{" "}
            <Link to="/terms" className="hover:text-zinc-900">
              Terms of Service
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
      <h2 className="text-[22px] font-semibold text-zinc-900 tracking-tight mt-8">
        {title}
      </h2>
      <div className="text-[15px] leading-relaxed text-zinc-700 space-y-3">
        {children}
      </div>
    </section>
  );
}

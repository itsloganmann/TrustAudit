/**
 * Legal / DPDP Act compliance configuration.
 *
 * Single source of truth for the values that appear on the Privacy Policy,
 * Terms of Service, and footer legal block. Every field is backed by a
 * Vite build-time env var (VITE_LEGAL_*), so we can override them at
 * deploy time without touching source — see render.yaml for the Render
 * wiring.
 *
 * IMPORTANT — PRODUCTION READINESS:
 * The defaults below are the values that ship with the repo as sensible
 * starter text. Before onboarding real customers, every field marked
 * TODO_LEGAL must be replaced with the registered-entity values from your
 * Indian lawyer. See PRODUCTION_READINESS.md at the repo root for the
 * full checklist.
 *
 * Vite only exposes env vars prefixed with VITE_ to the client bundle.
 * Do NOT put secrets here — this file is public and ships in the JS
 * bundle that every visitor downloads.
 */

const env = import.meta.env || {};

/** Helper that returns the env var if set (non-empty string), otherwise the default. */
function envOr(key, fallback) {
  const value = env[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return fallback;
}

export const LEGAL = {
  // ---------------------------------------------------------------------
  // Company / Data Fiduciary identity (required by DPDP Act §5 and §6)
  // ---------------------------------------------------------------------
  companyName: envOr("VITE_LEGAL_COMPANY_NAME", "TrustAudit"),
  companyLegalName: envOr(
    "VITE_LEGAL_COMPANY_LEGAL_NAME",
    "TrustAudit (registered entity name pending incorporation)"
  ),
  companyRegistration: envOr(
    "VITE_LEGAL_COMPANY_REGISTRATION",
    "Entity registration pending (pre-incorporation pilot)"
  ),
  registeredAddress: envOr(
    "VITE_LEGAL_REGISTERED_ADDRESS",
    "Registered address pending (pre-incorporation pilot)"
  ),
  jurisdictionCity: envOr("VITE_LEGAL_JURISDICTION_CITY", "Bengaluru"),

  // ---------------------------------------------------------------------
  // Contact channels
  // ---------------------------------------------------------------------
  privacyEmail: envOr("VITE_LEGAL_PRIVACY_EMAIL", "privacy@trustaudit.in"),
  supportEmail: envOr("VITE_LEGAL_SUPPORT_EMAIL", "support@trustaudit.in"),

  // ---------------------------------------------------------------------
  // Grievance Officer (required by DPDP Rule 5(9))
  // ---------------------------------------------------------------------
  grievanceOfficerName: envOr(
    "VITE_LEGAL_GRIEVANCE_OFFICER_NAME",
    "Logan Mann (co-founder, acting Grievance Officer pending DPDP Rule 5(9) appointment)"
  ),
  grievanceOfficerEmail: envOr(
    "VITE_LEGAL_GRIEVANCE_OFFICER_EMAIL",
    "grievance@trustaudit.in"
  ),
  grievanceOfficerPhone: envOr(
    "VITE_LEGAL_GRIEVANCE_OFFICER_PHONE",
    "Reachable via grievance@trustaudit.in until a phone line is listed"
  ),
  grievanceOfficerAddress: envOr(
    "VITE_LEGAL_GRIEVANCE_OFFICER_ADDRESS",
    "Address pending registered-entity incorporation (contact via email for now)"
  ),

  // ---------------------------------------------------------------------
  // Document revision metadata — bump when you amend the policy
  // ---------------------------------------------------------------------
  privacyLastUpdated: envOr("VITE_LEGAL_PRIVACY_LAST_UPDATED", "7 April 2026"),
  termsLastUpdated: envOr("VITE_LEGAL_TERMS_LAST_UPDATED", "7 April 2026"),

  // ---------------------------------------------------------------------
  // Data hosting region (disclosed per DPDP cross-border rules)
  // ---------------------------------------------------------------------
  hostingRegion: envOr("VITE_LEGAL_HOSTING_REGION", "United States (Render Oregon)"),
  plannedHostingRegion: envOr(
    "VITE_LEGAL_PLANNED_HOSTING_REGION",
    "India (migration in evaluation)"
  ),
};

/**
 * Returns true when a legal field is still an unresolved placeholder.
 * Used by the Privacy/Terms pages to render a visible "not yet production
 * ready" banner when running against defaults, so nobody accidentally
 * onboards a real customer against unresolved legal copy.
 */
export function hasUnresolvedLegalFields() {
  return Object.values(LEGAL).some(
    (v) => typeof v === "string" && v.startsWith("TODO_LEGAL")
  );
}

export default LEGAL;

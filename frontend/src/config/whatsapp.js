/**
 * Single source of truth for the TrustAudit demo WhatsApp number.
 *
 * If we re-pair the sidecar to a new phone, bump BOTH constants here and
 * everything else on the site updates automatically:
 *   - Landing hero CTA
 *   - DriverOnboarding instructions
 *   - DriverShell welcome header
 *   - DemoCTAPanel button
 *   - LiveDemo wa.me deep link
 *
 * DO NOT hardcode the number in any component — always import from here.
 */

/** E.164 digits only, for wa.me URLs. */
export const WHATSAPP_NUMBER_RAW = "14085959751";

/** Pretty display form, for rendering in JSX. */
export const WHATSAPP_NUMBER_DISPLAY = "+1 408 595 9751";

/** The "first message" pre-filled in the wa.me deep link. Keep short. */
export const WHATSAPP_FIRST_MESSAGE = "hi";

/** wa.me deep link that opens WhatsApp straight to the paired chat. */
export const WA_LINK = `https://wa.me/${WHATSAPP_NUMBER_RAW}?text=${encodeURIComponent(
  WHATSAPP_FIRST_MESSAGE
)}`;

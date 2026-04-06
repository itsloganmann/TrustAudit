/**
 * Wrappers around the TrustAudit auth endpoints.
 *
 * All functions return Promises and throw `ApiError` on failure.
 * The backend sets an httpOnly `trustaudit_session` cookie on success and
 * returns `{ user: { id, full_name, role, enterprise_id, msme_id, ... } }`.
 */
import { api, ApiError } from "./api.js";

/**
 * Email + password signup.
 * @param {"vendor"|"driver"} role
 * @param {{ email: string, password: string, full_name?: string }} payload
 */
export function signupPassword(role, payload) {
  return api(`/auth/${role}/signup`, { method: "POST", body: payload });
}

/**
 * Email + password signin.
 * @param {"vendor"|"driver"} role
 * @param {{ email: string, password: string }} payload
 */
export function signinPassword(role, payload) {
  return api(`/auth/${role}/signin`, { method: "POST", body: payload });
}

/** Sign out the current session. */
export function signout() {
  return api(`/auth/signout`, { method: "POST" });
}

/**
 * GET /auth/me — returns the user object or `null` on 401.
 *
 * Other errors (network, 500) propagate.
 */
export async function me() {
  try {
    const res = await api(`/auth/me`);
    if (res && res.user) return res.user;
    return res || null;
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return null;
    throw err;
  }
}

/**
 * Request an email magic-link to be sent.
 * @param {"vendor"|"driver"} role
 * @param {string} email
 */
export function requestMagicLink(role, email) {
  return api(`/auth/magic/request`, {
    method: "POST",
    body: { email, role },
  });
}

/**
 * Consume a magic-link token (called by the MagicLink landing page).
 * @param {string} token
 */
export function consumeMagicLink(token) {
  return api(`/auth/magic/consume?token=${encodeURIComponent(token)}`);
}

/**
 * Verify an email-confirmation token.
 * @param {string} token
 */
export function verifyEmail(token) {
  return api(`/auth/verify-email?token=${encodeURIComponent(token)}`);
}

/**
 * Send an OTP to a phone number via WhatsApp or SMS.
 * @param {"whatsapp"|"phone"} channel
 * @param {string} phone - E.164 phone number, e.g. "+919876543210".
 * @param {"vendor"|"driver"} role
 */
export function sendOtp(channel, phone, role) {
  return api(`/auth/otp/${channel}/send`, {
    method: "POST",
    body: { phone, role },
  });
}

/**
 * Verify an OTP code.
 * @param {"whatsapp"|"phone"} channel
 * @param {string} phone
 * @param {string} code
 * @param {"vendor"|"driver"} role
 */
export function verifyOtp(channel, phone, code, role) {
  return api(`/auth/otp/${channel}/verify`, {
    method: "POST",
    body: { phone, code, role },
  });
}

/**
 * Sign in with a Google ID token (returned by Google Identity Services).
 * @param {string} idToken
 * @param {"vendor"|"driver"} role
 */
export function signinGoogle(idToken, role) {
  return api(`/auth/oauth/google`, {
    method: "POST",
    body: { id_token: idToken, role },
  });
}

/**
 * Sign in with a Facebook access token.
 * @param {string} accessToken
 * @param {"vendor"|"driver"} role
 */
export function signinFacebook(accessToken, role) {
  return api(`/auth/oauth/facebook`, {
    method: "POST",
    body: { access_token: accessToken, role },
  });
}

/* ── Identity linking ───────────────────────────────────────────────── */

/** List linked identities for the current user. */
export function listIdentities() {
  return api(`/auth/identities`);
}

/**
 * Link an additional Google identity to the current user.
 * @param {string} idToken
 */
export function linkGoogle(idToken) {
  return api(`/auth/identities/google`, {
    method: "POST",
    body: { id_token: idToken },
  });
}

/**
 * Unlink an identity by its identity row id.
 * @param {string|number} identityId
 */
export function unlinkIdentity(identityId) {
  return api(`/auth/identities/${identityId}`, { method: "DELETE" });
}

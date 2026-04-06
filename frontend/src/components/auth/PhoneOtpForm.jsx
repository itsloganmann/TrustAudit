import WhatsAppOtpForm from "./WhatsAppOtpForm.jsx";

/**
 * SMS phone-OTP form. Same UX as WhatsAppOtpForm, different channel.
 */
export default function PhoneOtpForm({ role }) {
  return <WhatsAppOtpForm role={role} channel="phone" />;
}

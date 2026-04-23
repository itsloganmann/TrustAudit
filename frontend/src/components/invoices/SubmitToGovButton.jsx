import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Landmark, Lock, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "../../lib/api.js";

const DEFAULT_THRESHOLD = 0.85;

function getThreshold() {
  const raw =
    typeof import.meta !== "undefined" && import.meta.env
      ? import.meta.env.VITE_SUBMIT_CONFIDENCE_THRESHOLD
      : undefined;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1
    ? parsed
    : DEFAULT_THRESHOLD;
}

/**
 * Gold "Submit to Government" button. Disabled with tooltip when not eligible.
 *
 * @param {object} props
 * @param {{id:string|number, state:string, confidence_score?:number, missing_fields?:string[], submitted_to_gov_at?:string|null}} props.invoice
 * @param {(updated:object)=>void} [props.onSubmitted]
 * @param {string} [props.className]
 */
export default function SubmitToGovButton({
  invoice,
  onSubmitted,
  className = "",
}) {
  const [threshold, setThreshold] = useState(DEFAULT_THRESHOLD);
  const [submitting, setSubmitting] = useState(false);
  const [optimisticState, setOptimisticState] = useState(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    setThreshold(getThreshold());
  }, []);

  // Reset optimistic state when invoice id changes
  useEffect(() => {
    setOptimisticState(null);
  }, [invoice?.id]);

  const effectiveState = optimisticState || invoice?.state || "PENDING";
  const confidence =
    typeof invoice?.confidence_score === "number"
      ? invoice.confidence_score
      : null;
  const missing = Array.isArray(invoice?.missing_fields)
    ? invoice.missing_fields
    : [];
  const alreadySubmitted =
    effectiveState === "SUBMITTED_TO_GOV" || !!invoice?.submitted_to_gov_at;

  const { eligible, reason } = useMemo(() => {
    if (alreadySubmitted) {
      return { eligible: false, reason: "Already filed with the government." };
    }
    if (effectiveState !== "VERIFIED") {
      return {
        eligible: false,
        reason: `Document must be VERIFIED before filing (currently ${effectiveState}).`,
      };
    }
    if (confidence === null) {
      return { eligible: false, reason: "No confidence score available yet." };
    }
    if (confidence < threshold) {
      return {
        eligible: false,
        reason: `Confidence ${Math.round(
          confidence * 100
        )}% is below the ${Math.round(threshold * 100)}% filing threshold.`,
      };
    }
    if (missing.length > 0) {
      return {
        eligible: false,
        reason: `Missing fields: ${missing.join(", ")}`,
      };
    }
    return { eligible: true, reason: null };
  }, [alreadySubmitted, effectiveState, confidence, threshold, missing]);

  async function handleSubmit() {
    if (!eligible || submitting || !invoice?.id) return;
    setSubmitting(true);
    setOptimisticState("SUBMITTED_TO_GOV"); // Optimistic UI

    try {
      const result = await api(`/invoices/${invoice.id}/submit-to-gov`, {
        method: "POST",
      });
      toast.success("Filed with government portal", {
        description: `${invoice.invoice_number || "Document"} successfully submitted.`,
        duration: 5000,
      });
      onSubmitted?.(result || { ...invoice, state: "SUBMITTED_TO_GOV" });
    } catch (err) {
      // Roll back optimistic state on failure
      setOptimisticState(null);
      const message =
        err instanceof ApiError
          ? err.message
          : err?.message || "Submission failed.";
      toast.error("Filing failed", {
        description: message,
        duration: 7000,
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`relative inline-flex ${className}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <motion.button
        type="button"
        onClick={handleSubmit}
        disabled={!eligible || submitting}
        whileHover={eligible ? { y: -1 } : undefined}
        whileTap={eligible ? { scale: 0.98 } : undefined}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className={`relative inline-flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-bold uppercase tracking-wider overflow-hidden border ${
          eligible
            ? "text-white bg-emerald-600 hover:bg-emerald-700 border-emerald-600 cursor-pointer"
            : "text-zinc-500 bg-white border-zinc-200 cursor-not-allowed"
        }`}
      >
        {alreadySubmitted ? (
          <>
            <CheckCircle2 size={13} strokeWidth={2.5} />
            Filed
          </>
        ) : submitting ? (
          <>
            <Loader2 size={13} className="animate-spin" />
            Filing...
          </>
        ) : eligible ? (
          <>
            <Landmark size={13} strokeWidth={2.5} />
            Submit to Gov
          </>
        ) : (
          <>
            <Lock size={13} strokeWidth={2.5} />
            Submit to Gov
          </>
        )}
      </motion.button>

      <AnimatePresence>
        {hovered && reason && (
          <motion.span
            initial={{ opacity: 0, y: -2 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -2 }}
            className="absolute left-1/2 -translate-x-1/2 -top-2 -translate-y-full z-50 max-w-[260px] whitespace-normal rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-[10px] text-zinc-700 shadow-sm"
            role="tooltip"
          >
            {reason}
          </motion.span>
        )}
      </AnimatePresence>
    </div>
  );
}

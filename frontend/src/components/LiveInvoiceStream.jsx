import { useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { useAuth } from "../hooks/useAuth.js";
import { useSSE } from "../hooks/useSSE.js";

/**
 * Pure side-effect component that subscribes the authenticated vendor shell
 * to the Phase I SSE stream and fires sonner toasts on incoming frames.
 *
 * Transport contract (matches `feat/phase-i-sse-backend`):
 *   GET /api/live/stream?session=vendor-<user_id>
 *
 * Named events:
 *   - `invoice.ingested`  — a WhatsApp challan was received, verification pending.
 *   - `invoice.extracted` — the challan was verified and ingested into the ledger.
 *   - `stream.heartbeat`  — keep-alive, intentionally dropped.
 *
 * The component renders nothing and never polls — App.jsx is still the source
 * of truth for data fetching. LiveInvoiceStream exists purely to turn WhatsApp
 * events into feedback in the UI the moment they happen.
 *
 * If `onStatus` is supplied, the current SSE status string is forwarded to the
 * parent so it can throttle its own polling (see VendorShell wiring).
 *
 * @param {object} [props]
 * @param {(status: "idle"|"open"|"polling"|"error") => void} [props.onStatus]
 */
export default function LiveInvoiceStream({ onStatus } = {}) {
  const { user } = useAuth();

  const url = useMemo(() => {
    if (!user?.id) return null;
    return `/api/live/stream?session=vendor-${encodeURIComponent(user.id)}`;
  }, [user?.id]);

  const events = useMemo(
    () => ({
      "invoice.ingested": (payload) => {
        const vendor =
          payload?.vendor_display_name || payload?.vendor_name || "supplier";
        toast("Challan received — verifying…", {
          description: `From ${vendor}`,
          duration: 5000,
        });
      },
      "invoice.extracted": (payload) => {
        const vendor =
          payload?.vendor_display_name || payload?.vendor_name || "supplier";
        const amountRaw = Number(
          payload?.amount ?? payload?.invoice_amount ?? 0,
        );
        const amountLabel =
          Number.isFinite(amountRaw) && amountRaw > 0
            ? `INR ${amountRaw.toLocaleString("en-IN")}`
            : "INR —";
        toast.success(`Verified: ${amountLabel} from ${vendor}`, {
          description: payload?.invoice_number
            ? `Invoice ${payload.invoice_number}`
            : "43B(h) shield extended",
          duration: 6000,
          style: {
            background: "#0f172a",
            border: "1px solid rgba(16, 185, 129, 0.35)",
            color: "#f8fafc",
          },
        });
      },
      // heartbeat frames deliberately dropped
    }),
    [],
  );

  const { status } = useSSE({
    url,
    events,
    enabled: Boolean(url),
    pollMs: 15000,
  });

  // Forward status to the parent shell without adding any DOM nodes.
  // Kept in a ref so the parent can swap the callback between renders
  // without re-firing the subscribe effect.
  const statusCallbackRef = useRef(onStatus);
  useEffect(() => {
    statusCallbackRef.current = onStatus;
  }, [onStatus]);

  useEffect(() => {
    if (statusCallbackRef.current) statusCallbackRef.current(status);
  }, [status]);

  return null;
}

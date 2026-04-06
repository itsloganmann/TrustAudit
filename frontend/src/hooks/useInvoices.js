import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api.js";
import { openEventStream } from "../lib/sse.js";

/**
 * @typedef {object} Invoice
 * @property {string|number} id
 * @property {string} state
 * @property {number} [confidence_score]
 * @property {string[]} [missing_fields]
 * @property {object[]} [detected_edge_cases]
 * @property {string} [compliance_pdf_url]
 * @property {string|null} [submitted_to_gov_at]
 */

/**
 * Polling + SSE merged feed for invoices.
 *
 * - Initial fetch via GET /api/invoices
 * - Polls every `pollMs` ms (default 4000)
 * - Subscribes to SSE at /api/invoices/stream and merges patches in
 *
 * @param {object} [opts]
 * @param {number} [opts.pollMs=4000]
 * @param {string} [opts.endpoint="/invoices"]
 * @param {string} [opts.streamUrl="/api/invoices/stream"]
 * @param {boolean} [opts.enableStream=true]
 * @returns {{ invoices: Invoice[], loading: boolean, error: any, refresh: ()=>Promise<void>, updateInvoice: (patch:Partial<Invoice>)=>void }}
 */
export function useInvoices({
  pollMs = 4000,
  endpoint = "/invoices",
  streamUrl = "/api/invoices/stream",
  enableStream = true,
} = {}) {
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const mountedRef = useRef(true);

  const fetchInvoices = useCallback(async () => {
    try {
      const data = await api(endpoint);
      if (!mountedRef.current) return;
      const list = Array.isArray(data) ? data : data?.invoices || [];
      setInvoices(list);
      setError(null);
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [endpoint]);

  // Initial fetch + polling
  useEffect(() => {
    mountedRef.current = true;
    fetchInvoices();
    const interval = setInterval(fetchInvoices, pollMs);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
    };
  }, [fetchInvoices, pollMs]);

  // SSE merge stream
  useEffect(() => {
    if (!enableStream) return undefined;
    const close = openEventStream(streamUrl, {
      onMessage: (msg) => {
        if (!msg || typeof msg !== "object") return;
        // Accept either {type:'invoice.upsert', invoice:{...}} or a bare invoice
        const incoming = msg.invoice || msg;
        if (!incoming || incoming.id === undefined) return;
        setInvoices((prev) => {
          const idx = prev.findIndex((p) => p.id === incoming.id);
          if (idx === -1) return [incoming, ...prev];
          const next = prev.slice();
          next[idx] = { ...prev[idx], ...incoming };
          return next;
        });
      },
      onError: () => {
        // Silently swallow — polling provides the fallback
      },
    });
    return close;
  }, [enableStream, streamUrl]);

  const updateInvoice = useCallback((patch) => {
    if (!patch || patch.id === undefined) return;
    setInvoices((prev) => {
      const idx = prev.findIndex((p) => p.id === patch.id);
      if (idx === -1) return prev;
      const next = prev.slice();
      next[idx] = { ...prev[idx], ...patch };
      return next;
    });
  }, []);

  return {
    invoices,
    loading,
    error,
    refresh: fetchInvoices,
    updateInvoice,
  };
}

export default useInvoices;

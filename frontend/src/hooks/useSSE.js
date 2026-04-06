import { useEffect, useRef, useState } from "react";
import { openEventStream } from "../lib/sse.js";

/**
 * Subscribe to a Server-Sent Events stream and fall back to polling on failure.
 *
 * @param {object} opts
 * @param {string|null} opts.url - The SSE URL. If null/empty, the hook is idle.
 * @param {(data:any)=>void} [opts.onMessage] - Called for each parsed event.
 * @param {() => Promise<any>} [opts.fallback] - Called every `pollMs` if SSE fails.
 * @param {number} [opts.pollMs=2000] - Fallback polling interval.
 * @param {boolean} [opts.enabled=true] - Disable to skip stream + polling.
 * @returns {{ status: "idle"|"open"|"polling"|"error", lastEvent: any }}
 */
export function useSSE({
  url,
  onMessage,
  fallback,
  pollMs = 2000,
  enabled = true,
} = {}) {
  const [status, setStatus] = useState("idle");
  const [lastEvent, setLastEvent] = useState(null);
  const callbackRef = useRef(onMessage);
  const fallbackRef = useRef(fallback);

  useEffect(() => {
    callbackRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    fallbackRef.current = fallback;
  }, [fallback]);

  useEffect(() => {
    if (!enabled || !url) {
      setStatus("idle");
      return undefined;
    }

    let cancelled = false;
    let pollTimer = null;

    const startPolling = () => {
      if (cancelled || pollTimer) return;
      setStatus("polling");
      const tick = async () => {
        if (cancelled) return;
        try {
          if (fallbackRef.current) {
            const data = await fallbackRef.current();
            if (!cancelled) {
              setLastEvent(data);
              callbackRef.current?.(data);
            }
          }
        } catch {
          /* ignore polling errors, keep retrying */
        }
      };
      tick();
      pollTimer = setInterval(tick, pollMs);
    };

    let close = () => {};
    try {
      close = openEventStream(url, {
        onOpen: () => {
          if (!cancelled) setStatus("open");
        },
        onMessage: (data) => {
          if (cancelled) return;
          setLastEvent(data);
          callbackRef.current?.(data);
        },
        onError: () => {
          if (cancelled) return;
          setStatus("error");
          startPolling();
        },
      });
    } catch {
      startPolling();
    }

    return () => {
      cancelled = true;
      try {
        close();
      } catch {
        /* ignore */
      }
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [url, enabled, pollMs]);

  return { status, lastEvent };
}

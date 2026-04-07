import { useEffect, useRef, useState } from "react";
import { openEventStream } from "../lib/sse.js";

/**
 * Subscribe to a Server-Sent Events stream and fall back to polling on failure.
 *
 * @param {object} opts
 * @param {string|null} opts.url - The SSE URL. If null/empty, the hook is idle.
 * @param {(data:any)=>void} [opts.onMessage] - Fires on every frame (default or
 *   named) with the parsed JSON payload.
 * @param {Record<string,(data:any)=>void>} [opts.events] - Per-named-event handlers
 *   that fire with just the parsed payload. Example:
 *   `{ "invoice.extracted": (row) => ... }`.
 * @param {() => Promise<any>} [opts.fallback] - Called every `pollMs` if SSE fails.
 * @param {number} [opts.pollMs=2000] - Fallback polling interval.
 * @param {boolean} [opts.enabled=true] - Disable to skip stream + polling.
 * @returns {{ status: "idle"|"open"|"polling"|"error", lastEvent: any }}
 */
export function useSSE({
  url,
  onMessage,
  events,
  fallback,
  pollMs = 2000,
  enabled = true,
} = {}) {
  const [status, setStatus] = useState("idle");
  const [lastEvent, setLastEvent] = useState(null);
  const callbackRef = useRef(onMessage);
  const eventsRef = useRef(events);
  const fallbackRef = useRef(fallback);

  useEffect(() => {
    callbackRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

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

    // Bind every named-event handler through a stable dispatcher so
    // the underlying EventSource can keep long-lived listeners across
    // renders. The dispatcher always reads from ``eventsRef.current``.
    const eventsProxy = {};
    const currentEvents = eventsRef.current || {};
    for (const name of Object.keys(currentEvents)) {
      eventsProxy[name] = (data) => {
        const handler = eventsRef.current?.[name];
        if (typeof handler === "function") handler(data);
      };
    }

    let close = () => {};
    try {
      close = openEventStream(url, {
        onOpen: () => {
          if (!cancelled) setStatus("open");
        },
        events: eventsProxy,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, enabled, pollMs]);

  return { status, lastEvent };
}

/**
 * Open an EventSource against `url` and forward parsed JSON messages
 * to the provided callbacks.
 *
 * Returns a `close()` function that tears the stream down. Caller
 * is responsible for cleanup (e.g. inside a useEffect return).
 *
 * Named events
 * ------------
 * The server may emit either the default (unnamed) ``message`` event
 * or arbitrary named events such as ``invoice.extracted``. Default
 * events flow through ``onMessage``. Named events are dispatched to
 * the handler map passed as ``events`` and — for backward
 * compatibility — also fan out to ``onMessage`` so existing consumers
 * keep working.
 *
 * @param {string} url
 * @param {object} opts
 * @param {(data:any)=>void} [opts.onMessage] - Parsed payload of each event.
 * @param {Record<string,(data:any)=>void>} [opts.events] - Named-event handlers.
 * @param {(err:Event)=>void} [opts.onError]
 * @param {(ev:Event)=>void} [opts.onOpen]
 * @param {boolean} [opts.withCredentials=true]
 * @returns {() => void}
 */
export function openEventStream(
  url,
  {
    onMessage,
    events = {},
    onError,
    onOpen,
    withCredentials = true,
  } = {}
) {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }
  const es = new EventSource(url, { withCredentials });

  const parse = (raw) => {
    if (raw == null || raw === "") return null;
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  };

  es.onopen = (ev) => onOpen?.(ev);
  es.onmessage = (e) => {
    const data = parse(e.data);
    onMessage?.(data);
  };
  es.onerror = (e) => onError?.(e);

  // Register handlers for each named server event. EventSource
  // requires explicit ``addEventListener`` for anything other than
  // the default ``message`` event.
  const registered = [];
  for (const [name, handler] of Object.entries(events)) {
    if (typeof handler !== "function") continue;
    const listener = (e) => {
      const data = parse(e.data);
      handler(data);
      onMessage?.(data);
    };
    es.addEventListener(name, listener);
    registered.push([name, listener]);
  }

  return () => {
    for (const [name, listener] of registered) {
      try {
        es.removeEventListener(name, listener);
      } catch {
        /* ignore */
      }
    }
    try {
      es.close();
    } catch {
      /* ignore */
    }
  };
}

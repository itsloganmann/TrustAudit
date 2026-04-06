/**
 * Open an EventSource against `url` and forward parsed JSON messages
 * to the provided callbacks.
 *
 * Returns a `close()` function that tears the stream down. Caller
 * is responsible for cleanup (e.g. inside a useEffect return).
 *
 * @param {string} url
 * @param {object} opts
 * @param {(data:any)=>void} [opts.onMessage]
 * @param {(err:Event)=>void} [opts.onError]
 * @param {(ev:Event)=>void} [opts.onOpen]
 * @param {boolean} [opts.withCredentials=true]
 * @returns {() => void}
 */
export function openEventStream(
  url,
  { onMessage, onError, onOpen, withCredentials = true } = {}
) {
  if (typeof window === "undefined" || typeof EventSource === "undefined") {
    return () => {};
  }
  const es = new EventSource(url, { withCredentials });
  es.onopen = (ev) => onOpen?.(ev);
  es.onmessage = (e) => {
    try {
      const data = e.data ? JSON.parse(e.data) : null;
      onMessage?.(data);
    } catch {
      onMessage?.(e.data);
    }
  };
  es.onerror = (e) => onError?.(e);
  return () => {
    try {
      es.close();
    } catch {
      /* ignore */
    }
  };
}

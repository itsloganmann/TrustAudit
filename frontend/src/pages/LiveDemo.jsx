import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield,
  RefreshCcw,
  Plus,
  ArrowLeft,
  ExternalLink,
  Radio,
  MessageCircle,
  Clock,
  ShieldCheck,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";

/**
 * Public, read-only /live dashboard. Streams anonymized rows from the
 * demo-session store on the backend.
 *
 * Transport:
 *   1. Try EventSource on /api/stream/events?session=<id>
 *   2. Fall back to polling /api/live/invoices?session=<id> every 2s
 *
 * The row aesthetic mirrors the main Dashboard (glass table, animated
 * rows via Framer Motion, status pills, confidence bar). We render
 * locally — we do NOT import the main Dashboard component because
 * that component is authenticated, tenant-scoped, and outside the
 * forbidden-files list we're allowed to consume from.
 */

const WHATSAPP_NUMBER_RAW = "14085959751";
const JOIN_CODE = "hi";
const WA_LINK = `https://wa.me/${WHATSAPP_NUMBER_RAW}?text=${encodeURIComponent(JOIN_CODE)}`;
const POLL_INTERVAL_MS = 2000;
const MAX_AGE_SECONDS = 600;

// ---------------------------------------------------------------------------
// Session id helper — read or generate.
// ---------------------------------------------------------------------------

function readSessionIdFromUrl() {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  return params.get("session");
}

function writeSessionIdToUrl(id) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  url.searchParams.set("session", id);
  window.history.replaceState({}, "", url.toString());
}

function randomSessionId() {
  // Mirror backend secrets.token_hex(3) format: 6 hex chars.
  const bytes = new Uint8Array(3);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < 3; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

const LINKED_PHONE_KEY = "trustaudit:linkedPhone";

function readLinkedPhoneFromStorage() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(LINKED_PHONE_KEY);
  } catch {
    return null;
  }
}

function writeLinkedPhoneToStorage(id) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(LINKED_PHONE_KEY, id);
  } catch {
    /* ignore quota / disabled storage */
  }
}

function clearLinkedPhoneFromStorage() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(LINKED_PHONE_KEY);
  } catch {
    /* ignore */
  }
}

function phoneToSessionId(rawPhone) {
  // Mirrors backend ``_phone_to_session_id`` in webhook_whatsapp.py — last
  // 10 digits, prefixed with ``live-phone-``. The webhook stores into the
  // exact same key, so a frontend session=live-phone-XXXXXXXXXX picks up
  // submissions from that phone in real time.
  const digits = (rawPhone || "").replace(/\D/g, "").slice(-10);
  if (digits.length !== 10) return null;
  return `live-phone-${digits}`;
}

// ---------------------------------------------------------------------------
// Status + confidence bits
// ---------------------------------------------------------------------------

const STATE_CONFIG = {
  PENDING: {
    label: "Pending",
    bg: "bg-rose-500/8",
    text: "text-rose-400",
    dot: "bg-rose-500",
    border: "border-rose-500/15",
    pulse: true,
  },
  VERIFYING: {
    label: "Verifying",
    bg: "bg-amber-500/8",
    text: "text-amber-400",
    dot: "bg-amber-500",
    border: "border-amber-500/15",
    pulse: true,
  },
  VERIFIED: {
    label: "Verified",
    bg: "bg-emerald-500/8",
    text: "text-emerald-400",
    dot: "bg-emerald-500",
    border: "border-emerald-500/15",
    pulse: false,
  },
  NEEDS_INFO: {
    label: "Needs Info",
    bg: "bg-amber-500/8",
    text: "text-amber-400",
    dot: "bg-amber-500",
    border: "border-amber-500/15",
    pulse: true,
  },
  SUBMITTED_TO_GOV: {
    label: "Submitted",
    bg: "bg-blue-500/8",
    text: "text-blue-400",
    dot: "bg-blue-500",
    border: "border-blue-500/15",
    pulse: false,
  },
  DISPUTED: {
    label: "Disputed",
    bg: "bg-violet-500/8",
    text: "text-violet-400",
    dot: "bg-violet-500",
    border: "border-violet-500/15",
    pulse: false,
  },
};

function StateBadge({ state }) {
  const c = STATE_CONFIG[state] || STATE_CONFIG.PENDING;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wider ${c.bg} ${c.text} border ${c.border}`}
    >
      <span className={`w-1 h-1 rounded-full ${c.dot} ${c.pulse ? "pulse-dot" : ""}`} />
      {c.label}
    </span>
  );
}

function ConfidenceBar({ value }) {
  const pct = Math.round((Number(value) || 0) * 100);
  const color =
    pct >= 90 ? "#10b981" : pct >= 80 ? "#3b82f6" : pct >= 70 ? "#f59e0b" : "#f43f5e";
  return (
    <div className="flex items-center gap-2 justify-end">
      <div className="w-16 h-[3px] rounded-full bg-white/[0.05] overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ type: "spring", stiffness: 120, damping: 22 }}
          style={{ background: color }}
        />
      </div>
      <span className="text-[11px] tabular-nums font-medium" style={{ color }}>
        {pct}%
      </span>
    </div>
  );
}

function RelativeTime({ timestamp }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(id);
  }, []);
  const ageSec = Math.max(0, Math.floor(now / 1000 - Number(timestamp || 0)));
  let label;
  if (ageSec < 5) label = "just now";
  else if (ageSec < 60) label = `${ageSec}s ago`;
  else if (ageSec < 3600) label = `${Math.floor(ageSec / 60)}m ago`;
  else label = `${Math.floor(ageSec / 3600)}h ago`;
  return (
    <span
      className="text-[11px] text-slate-600 tabular-nums"
      title={new Date((timestamp || 0) * 1000).toISOString()}
    >
      {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function LiveDemo() {
  const [sessionId, setSessionId] = useState(() => readSessionIdFromUrl() || "");
  const [invoices, setInvoices] = useState([]);
  const [connected, setConnected] = useState(false);
  const [transport, setTransport] = useState("idle"); // 'sse' | 'poll' | 'idle'
  const [creating, setCreating] = useState(false);
  const [phoneInput, setPhoneInput] = useState("");
  const [linkError, setLinkError] = useState("");
  const [expandedKey, setExpandedKey] = useState(null);
  const lastFetchRef = useRef(0);

  // Bootstrap: pick the right session id on mount.
  // Order of precedence:
  //   1. ?session=<id> in the URL (manual override)
  //   2. localStorage linked phone (sticky private feed)
  //   3. "*" wildcard public firehose (default — anyone landing on
  //      /live sees every recent submission)
  useEffect(() => {
    if (sessionId) return;
    const fromUrl = readSessionIdFromUrl();
    const linked = readLinkedPhoneFromStorage();
    const initial = fromUrl || linked || "*";
    writeSessionIdToUrl(initial);
    setSessionId(initial);
  }, [sessionId]);

  // Re-key the session to a phone-bound id and persist to localStorage.
  const linkPhone = useCallback(() => {
    setLinkError("");
    const id = phoneToSessionId(phoneInput);
    if (!id) {
      setLinkError("Enter at least 10 digits.");
      return;
    }
    writeLinkedPhoneToStorage(id);
    writeSessionIdToUrl(id);
    setSessionId(id);
    setInvoices([]);
  }, [phoneInput]);

  // Drop the linked phone and fall back to the public firehose.
  const unlinkPhone = useCallback(() => {
    clearLinkedPhoneFromStorage();
    writeSessionIdToUrl("*");
    setSessionId("*");
    setPhoneInput("");
    setLinkError("");
    setInvoices([]);
  }, []);

  // Fetch loop + SSE attempt.
  const fetchOnce = useCallback(async () => {
    if (!sessionId) return;
    try {
      const resp = await fetch(
        `/api/live/invoices?session=${encodeURIComponent(sessionId)}&max_age=${MAX_AGE_SECONDS}`,
      );
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      setInvoices(Array.isArray(data.invoices) ? data.invoices : []);
      setConnected(true);
      lastFetchRef.current = Date.now();
    } catch {
      setConnected(false);
      // Swallow — the dashboard stays usable with the last-known state.
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId) return undefined;

    let es = null;
    let pollTimer = null;
    let cancelled = false;

    const startPolling = () => {
      setTransport("poll");
      fetchOnce();
      pollTimer = setInterval(fetchOnce, POLL_INTERVAL_MS);
    };

    const tryStream = () => {
      if (typeof EventSource === "undefined") {
        startPolling();
        return;
      }
      try {
        es = new EventSource(`/api/stream/events?session=${encodeURIComponent(sessionId)}`);
      } catch {
        startPolling();
        return;
      }
      let streamOk = false;
      const fallbackTimer = setTimeout(() => {
        if (!streamOk && !cancelled) {
          // Never got an event — fall back to polling, but still do an
          // initial fetch so the UI isn't empty.
          try {
            es?.close();
          } catch {
            /* ignore */
          }
          es = null;
          startPolling();
        }
      }, 3000);

      es.onopen = () => {
        streamOk = true;
        setTransport("sse");
        setConnected(true);
        // Prime the initial state via a single REST call, then rely
        // on the SSE feed for deltas.
        fetchOnce();
      };
      es.onmessage = () => {
        // The stream is a bump-signal. We re-pull the canonical list
        // from the REST endpoint to keep anonymization + filtering in
        // one place.
        fetchOnce();
      };
      es.onerror = () => {
        clearTimeout(fallbackTimer);
        try {
          es?.close();
        } catch {
          /* ignore */
        }
        es = null;
        if (!cancelled) startPolling();
      };
    };

    tryStream();

    return () => {
      cancelled = true;
      if (es) {
        try {
          es.close();
        } catch {
          /* ignore */
        }
      }
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [sessionId, fetchOnce]);

  // "Start new session" — mint a new id and reload with it.
  const handleNewSession = useCallback(async () => {
    setCreating(true);
    try {
      const resp = await fetch("/api/demo/new-session", { method: "POST" });
      if (resp.ok) {
        const data = await resp.json();
        const id = data.session_id || randomSessionId();
        writeSessionIdToUrl(id);
        setSessionId(id);
        setInvoices([]);
      } else {
        throw new Error("new-session failed");
      }
    } catch {
      const id = randomSessionId();
      writeSessionIdToUrl(id);
      setSessionId(id);
      setInvoices([]);
    } finally {
      setCreating(false);
    }
  }, []);

  const stats = useMemo(() => {
    const total = invoices.length;
    const verified = invoices.filter((i) => i.state === "VERIFIED").length;
    const verifying = invoices.filter((i) => i.state === "VERIFYING").length;
    const needsInfo = invoices.filter((i) => i.state === "NEEDS_INFO").length;
    return { total, verified, verifying, needsInfo };
  }, [invoices]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-400 font-sans antialiased">
      {/* Header */}
      <header className="border-b border-white/[0.06] bg-slate-950/70 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-[1500px] mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <a
              href="/"
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors text-[12px] font-medium"
            >
              <ArrowLeft size={13} />
              Back
            </a>
            <div className="w-px h-6 bg-white/[0.06]" />
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center flex-shrink-0">
                <Shield size={15} className="text-slate-950" strokeWidth={2.5} />
              </div>
              <div className="min-w-0">
                <p className="text-white font-semibold text-[14px] tracking-tight leading-tight truncate">
                  TrustAudit Live Demo
                </p>
                <p className="text-[10px] text-slate-500 leading-tight">
                  Public, read-only, anonymized
                </p>
              </div>
            </div>
            <span className="hidden md:inline-flex ml-3 px-2 py-1 rounded-md bg-white/[0.04] border border-white/[0.08] text-[10px] text-slate-400 font-mono tracking-wide">
              session:{" "}
              <span className="text-emerald-400 ml-1 font-semibold tabular-nums">
                {sessionId === "*"
                  ? "ALL SUBMISSIONS"
                  : sessionId?.startsWith("live-phone-")
                    ? `phone …${sessionId.slice(-4)}`
                    : sessionId || "—"}
              </span>
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="relative flex h-2 w-2">
                {connected ? (
                  <>
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                  </>
                ) : (
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500" />
                )}
              </span>
              {connected ? (
                <>
                  Live
                  <span className="text-slate-700 ml-1 uppercase tracking-wide text-[9px] font-semibold">
                    {transport === "sse" ? "SSE" : transport === "poll" ? "POLL" : ""}
                  </span>
                </>
              ) : (
                "Reconnecting"
              )}
            </div>

            <button
              type="button"
              onClick={handleNewSession}
              disabled={creating}
              className="inline-flex items-center gap-1.5 px-3 h-9 rounded-lg glass glass-hover text-white text-[12px] font-semibold transition-all disabled:opacity-50"
            >
              {creating ? <RefreshCcw size={13} className="animate-spin" /> : <Plus size={13} />}
              New session
            </button>
          </div>
        </div>
      </header>

      {/* Main area */}
      <main className="max-w-[1500px] mx-auto px-6 py-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left: Table + stats */}
        <section className="lg:col-span-9 space-y-4">
          {/* Stat strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label="Total" value={stats.total} color="#f8fafc" icon={Radio} />
            <StatCard label="Verifying" value={stats.verifying} color="#f59e0b" icon={RefreshCcw} />
            <StatCard label="Verified" value={stats.verified} color="#10b981" icon={ShieldCheck} />
            <StatCard label="Needs info" value={stats.needsInfo} color="#f43f5e" icon={Clock} />
          </div>

          {/* Live table */}
          <div className="glass rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
              <div>
                <p className="text-[13px] text-white font-semibold tracking-tight">Live submissions</p>
                <p className="text-[11px] text-slate-500">
                  Rows auto-expire after {MAX_AGE_SECONDS / 60} minutes.
                </p>
              </div>
              <span className="text-[11px] text-slate-600 tabular-nums">
                {invoices.length} row{invoices.length === 1 ? "" : "s"}
              </span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/[0.06] text-[10px] text-slate-500 uppercase tracking-widest">
                  <th className="text-left px-4 py-2.5 font-semibold">Vendor</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Invoice</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Amount</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Confidence</th>
                  <th className="text-center px-3 py-2.5 font-semibold">Received</th>
                  <th className="text-center px-4 py-2.5 font-semibold">State</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence mode="popLayout" initial={false}>
                  {invoices.map((inv) => {
                    const key =
                      inv.invoice_number ||
                      `${inv.vendor_display_name}-${inv.created_at}`;
                    const isExpanded = expandedKey === key;
                    const missingFields = Array.isArray(inv.missing_fields)
                      ? inv.missing_fields
                      : [];
                    const extractedFields = Array.isArray(inv.extracted_fields)
                      ? inv.extracted_fields
                      : [];
                    return (
                      <Fragment key={key}>
                        <motion.tr
                          layout
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          transition={{ type: "spring", stiffness: 400, damping: 30 }}
                          onClick={() => setExpandedKey(isExpanded ? null : key)}
                          className={`row-transition border-b border-white/[0.04] cursor-pointer ${
                            isExpanded ? "bg-white/[0.03]" : ""
                          }`}
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div
                                className="w-1 h-8 rounded-full"
                                style={{
                                  background:
                                    inv.state === "VERIFIED"
                                      ? "#34d399"
                                      : inv.state === "NEEDS_INFO" || inv.state === "VERIFYING"
                                      ? "#fbbf24"
                                      : "#fb7185",
                                }}
                              />
                              <div>
                                <p className="text-[13px] text-white font-medium tracking-tight leading-tight flex items-center gap-1.5">
                                  {inv.vendor_display_name || "Vendor ?"}
                                  <ChevronRight
                                    size={11}
                                    className={`text-slate-600 transition-transform ${
                                      isExpanded ? "rotate-90" : ""
                                    }`}
                                  />
                                </p>
                                <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                                  {inv.gstin || "GSTIN hidden"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="px-3 py-3">
                            <span className="text-[12px] text-slate-400 font-mono">
                              {inv.invoice_number || "—"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <span className="text-[13px] text-white font-semibold tabular-nums tracking-tight">
                              {inv.amount
                                ? `INR ${Number(inv.amount).toLocaleString("en-IN")}`
                                : "—"}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <ConfidenceBar value={inv.confidence} />
                          </td>
                          <td className="px-3 py-3 text-center">
                            <RelativeTime timestamp={inv.created_at} />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StateBadge state={inv.state} />
                          </td>
                        </motion.tr>
                        {isExpanded && (
                          <motion.tr
                            key={`${key}-expand`}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.18 }}
                            className="border-b border-white/[0.04] bg-white/[0.015]"
                          >
                            <td colSpan={6} className="px-4 py-5">
                              <div className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-5">
                                {/* Thumbnail */}
                                <div className="rounded-lg overflow-hidden border border-white/[0.06] bg-slate-900/40 aspect-[3/4]">
                                  {inv.image_url ? (
                                    <img
                                      src={inv.image_url}
                                      alt="Challan"
                                      className="w-full h-full object-cover"
                                    />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center text-[10px] text-slate-600 uppercase tracking-wider">
                                      No image
                                    </div>
                                  )}
                                </div>
                                {/* Field chips */}
                                <div className="space-y-4">
                                  {missingFields.length > 0 && (
                                    <div>
                                      <p className="text-[10px] text-rose-400/90 font-mono uppercase tracking-[0.18em] mb-2">
                                        Missing ({missingFields.length})
                                      </p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {missingFields.map((label) => (
                                          <span
                                            key={`m-${label}`}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-rose-500/8 border border-rose-500/30 text-[11px] text-rose-300 font-medium"
                                          >
                                            <AlertTriangle size={10} />
                                            {label}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {extractedFields.length > 0 && (
                                    <div>
                                      <p className="text-[10px] text-emerald-400/90 font-mono uppercase tracking-[0.18em] mb-2">
                                        Extracted ({extractedFields.length})
                                      </p>
                                      <div className="flex flex-wrap gap-1.5">
                                        {extractedFields.map((label) => (
                                          <span
                                            key={`e-${label}`}
                                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-emerald-500/8 border border-emerald-500/30 text-[11px] text-emerald-300 font-medium"
                                          >
                                            <CheckCircle2 size={10} />
                                            {label}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  {missingFields.length === 0 &&
                                    extractedFields.length === 0 && (
                                      <p className="text-[12px] text-slate-500">
                                        No field detail available for this row.
                                      </p>
                                    )}
                                  {missingFields.length > 0 && (
                                    <div className="pt-2 border-t border-white/[0.06]">
                                      <p className="text-[11px] text-slate-400 leading-relaxed">
                                        Send a follow-up message to the
                                        WhatsApp bot with the missing
                                        information (e.g. "GSTIN
                                        29ABCDE1234F1Z5") and the row will
                                        re-process automatically.
                                      </p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </td>
                          </motion.tr>
                        )}
                      </Fragment>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>

            {invoices.length === 0 && (
              <div className="px-4 py-20 text-center">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 mb-4">
                  <MessageCircle size={20} className="text-emerald-400" />
                </div>
                <p className="text-[14px] text-white font-semibold mb-1">
                  No submissions yet
                </p>
                <p className="text-[12px] text-slate-500 max-w-sm mx-auto">
                  Send a challan photo to the TrustAudit WhatsApp bot and it
                  will land here in real time.
                </p>
              </div>
            )}

            <div className="px-4 py-2 border-t border-white/[0.06] flex items-center justify-between text-[10px] text-slate-600">
              <span>
                Anonymized public feed · {transport === "sse" ? "SSE" : transport === "poll" ? "2s poll" : "idle"}
              </span>
              <span className="flex items-center gap-1.5">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40" />
                  <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
                </span>
                Auto-expire {MAX_AGE_SECONDS / 60}m
              </span>
            </div>
          </div>
        </section>

        {/* Right: sidebar */}
        <aside className="lg:col-span-3 space-y-4">
          {/* Phone-link card — re-keys the session to a private feed */}
          <div className="glass rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-[13px] font-semibold text-white tracking-tight">
                Link your phone
              </p>
              {sessionId?.startsWith("live-phone-") && (
                <button
                  type="button"
                  onClick={unlinkPhone}
                  className="text-[10px] text-slate-500 hover:text-rose-400 uppercase tracking-wider font-semibold"
                >
                  Unlink
                </button>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
              Paste the WhatsApp number you'll send challans from. This page
              will then show only your submissions in real time.
            </p>
            <div className="flex items-center gap-2">
              <input
                type="tel"
                value={phoneInput}
                onChange={(e) => setPhoneInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") linkPhone();
                }}
                placeholder="+1 415 555 1234"
                className="flex-1 h-9 px-3 text-[12px] bg-white/[0.03] border border-white/[0.06] rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-emerald-400/50 transition-colors font-mono"
              />
              <button
                type="button"
                onClick={linkPhone}
                className="px-3 h-9 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-[11px] font-semibold tracking-wide uppercase transition-all"
              >
                Link
              </button>
            </div>
            {linkError && (
              <p className="mt-2 text-[10px] text-rose-400">{linkError}</p>
            )}
            {sessionId === "*" && (
              <p className="mt-3 text-[10px] text-slate-600 leading-relaxed">
                Currently watching the public firehose — every recent
                submission across every linked phone.
              </p>
            )}
          </div>

          <div className="glass rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-500/12 border border-emerald-500/25 flex items-center justify-center">
                <MessageCircle size={15} className="text-emerald-400" />
              </div>
              <p className="text-[13px] font-semibold text-white tracking-tight">
                Send a challan
              </p>
            </div>
            <p className="text-[12px] text-slate-400 leading-relaxed mb-4">
              Tap the button below from your phone. Pre-fills the TrustAudit
              WhatsApp bot with the join code.
            </p>
            <a
              href={WA_LINK}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full inline-flex items-center justify-center gap-2 px-4 h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-[13px] tracking-tight transition-all"
            >
              <MessageCircle size={14} strokeWidth={2.4} />
              Open WhatsApp
            </a>
            <p className="mt-3 text-[10px] text-slate-600 text-center font-mono">
              +1 408 595 9751
            </p>
          </div>

          <div className="glass rounded-2xl p-5">
            <p className="text-[13px] font-semibold text-white tracking-tight mb-2">
              What happens next
            </p>
            <ul className="space-y-2 text-[12px] text-slate-400 leading-relaxed">
              <li className="flex gap-2">
                <span className="text-emerald-400 font-bold">1.</span>
                You send a challan photo.
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 font-bold">2.</span>
                A row flashes amber (VERIFYING).
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 font-bold">3.</span>
                It turns green (VERIFIED) in ~15s.
              </li>
              <li className="flex gap-2">
                <span className="text-emerald-400 font-bold">4.</span>
                A 43B(h) PDF is ready to open.
              </li>
            </ul>
          </div>

          <a
            href="/about"
            className="block glass glass-hover rounded-2xl p-4 text-[12px] text-slate-300 hover:text-white transition-all"
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold">About the founders</span>
              <ExternalLink size={12} />
            </div>
            <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
              Meet the team shipping TrustAudit.
            </p>
          </a>
        </aside>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06] bg-slate-950/60 backdrop-blur-xl mt-8">
        <div className="max-w-[1500px] mx-auto px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-2 text-[11px] text-slate-600">
          <span>
            You are viewing the TrustAudit public demo. Data is anonymized and
            auto-expires in {MAX_AGE_SECONDS / 60} minutes.
          </span>
          <a href="/" className="hover:text-white transition-colors">
            trustaudit.onrender.com
          </a>
        </div>
      </footer>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat card — mirrors the main Dashboard aesthetic without importing it.
// ---------------------------------------------------------------------------

function StatCard({ label, value, color, icon: Icon }) {
  return (
    <div className="glass glass-hover rounded-xl px-4 py-3 group transition-all">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-medium">
          {label}
        </p>
        {Icon && (
          <Icon
            size={13}
            className="opacity-30 group-hover:opacity-60 transition-opacity"
            style={{ color }}
          />
        )}
      </div>
      <p
        className="text-[22px] font-bold tabular-nums leading-tight tracking-tight"
        style={{ color }}
      >
        {value}
      </p>
    </div>
  );
}

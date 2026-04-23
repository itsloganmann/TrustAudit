import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Radio,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import { api } from "../../lib/api.js";

function formatRelative(iso) {
  if (!iso) return "never";
  try {
    const then = new Date(iso).getTime();
    const diff = Math.max(0, Date.now() - then) / 1000;
    if (diff < 60) return `${Math.floor(diff)}s ago`;
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return `${Math.floor(diff / 86400)}d ago`;
  } catch {
    return iso;
  }
}

/**
 * Small widget showing the active WhatsApp provider + last successful event time.
 *
 * @param {object} props
 * @param {string} [props.className]
 * @param {number} [props.pollMs=10000]
 */
export default function ProviderHealthPanel({
  className = "",
  pollMs = 10000,
}) {
  const [data, setData] = useState({
    provider:
      (typeof import.meta !== "undefined" &&
        import.meta.env?.VITE_WHATSAPP_PROVIDER) ||
      "unknown",
    healthy: null,
    last_success_at: null,
    inbound_24h: null,
    error_rate_24h: null,
  });
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  async function load() {
    try {
      const res = await api(`/providers/whatsapp/health`);
      if (res) setData((prev) => ({ ...prev, ...res }));
    } catch {
      // Endpoint may not exist yet — keep defaults silently
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const i = setInterval(load, pollMs);
    return () => clearInterval(i);
  }, [pollMs]);

  // Re-render the relative timestamp every 10s
  useEffect(() => {
    const i = setInterval(() => setTick((t) => t + 1), 10000);
    return () => clearInterval(i);
  }, []);

  const healthy = data.healthy === null ? null : !!data.healthy;

  return (
    <div
      className={`rounded-xl bg-white border border-zinc-200 overflow-hidden ${className}`}
    >
      <div className="px-4 py-3 flex items-center gap-3">
        <div
          className={`w-9 h-9 rounded-lg flex items-center justify-center border ${
            healthy === false
              ? "bg-red-50 border-red-200"
              : healthy === true
              ? "bg-emerald-50 border-emerald-200"
              : "bg-zinc-50 border-zinc-200"
          }`}
        >
          {healthy === false ? (
            <AlertCircle size={14} className="text-red-700" />
          ) : healthy === true ? (
            <Radio size={14} className="text-emerald-700" />
          ) : (
            <Radio size={14} className="text-zinc-500" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[11px] text-zinc-900 font-semibold tracking-tight uppercase">
              {data.provider || "unknown"}
            </p>
            {healthy === true && (
              <motion.span
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ duration: 2, repeat: Infinity }}
                className="inline-flex items-center gap-1 text-[9px] text-emerald-700 font-mono uppercase tracking-wider"
              >
                <span className="w-1 h-1 rounded-full bg-emerald-500" />
                live
              </motion.span>
            )}
            {healthy === false && (
              <span className="text-[9px] text-red-700 font-mono uppercase tracking-wider">
                degraded
              </span>
            )}
          </div>
          <p
            className="text-[9px] text-zinc-500 font-mono mt-0.5"
            data-tick={tick}
          >
            last success {formatRelative(data.last_success_at)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setLoading(true);
            load();
          }}
          className="p-1.5 rounded-md hover:bg-zinc-50 text-zinc-500 hover:text-zinc-900 transition-colors"
          aria-label="Refresh provider health"
        >
          <RefreshCw size={11} className={loading ? "animate-spin" : ""} />
        </button>
      </div>

      {(data.inbound_24h !== null || data.error_rate_24h !== null) && (
        <div className="px-4 py-2 border-t border-zinc-200 grid grid-cols-2 gap-3 text-[10px]">
          <div>
            <p className="text-zinc-500 uppercase tracking-widest text-[8px]">
              Inbound 24h
            </p>
            <p className="text-zinc-900 font-mono tabular-nums">
              {data.inbound_24h ?? "—"}
            </p>
          </div>
          <div>
            <p className="text-zinc-500 uppercase tracking-widest text-[8px]">
              Error rate
            </p>
            <p
              className={`font-mono tabular-nums ${
                (data.error_rate_24h ?? 0) > 0.05
                  ? "text-red-700"
                  : "text-emerald-700"
              }`}
            >
              {data.error_rate_24h !== null
                ? `${(data.error_rate_24h * 100).toFixed(1)}%`
                : "—"}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

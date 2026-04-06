import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare,
  Upload,
  Image as ImageIcon,
  CheckCircle2,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

/* The 16 demo fixture filenames W3 ships in tests/fixtures/. */
const DEFAULT_FIXTURES = [
  "challan_clean_001.jpg",
  "challan_clean_002.jpg",
  "challan_clean_003.jpg",
  "challan_clean_004.jpg",
  "challan_blurry_001.jpg",
  "challan_blurry_002.jpg",
  "challan_low_res_001.jpg",
  "challan_low_res_002.jpg",
  "challan_missing_stamp_001.jpg",
  "challan_missing_signature_001.jpg",
  "challan_date_mismatch_001.jpg",
  "challan_amount_mismatch_001.jpg",
  "challan_gstin_mismatch_001.jpg",
  "challan_duplicate_001.jpg",
  "challan_handwritten_001.jpg",
  "challan_partial_obscured_001.jpg",
];

function isMockMode() {
  if (typeof import.meta === "undefined" || !import.meta.env) return false;
  const provider = import.meta.env.VITE_WHATSAPP_PROVIDER;
  return provider === "mock";
}

async function postWebhook({ file, filename, from = "+91-demo", text = "demo" }) {
  const fd = new FormData();
  fd.append("from", from);
  fd.append("text", text);
  if (file) {
    fd.append("media", file, filename || file.name);
  } else if (filename) {
    fd.append("fixture", filename);
  }
  const res = await fetch("/api/webhook/whatsapp/inbound", {
    method: "POST",
    credentials: "include",
    body: fd,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Webhook failed: ${res.status}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * Drag-and-drop fixture uploader for the offline WhatsApp demo path.
 *
 * @param {object} props
 * @param {string[]} [props.fixtures]
 * @param {boolean} [props.forceShow=false] - Render even when not in mock mode.
 * @param {string} [props.className]
 */
export default function WhatsAppMockPanel({
  fixtures = DEFAULT_FIXTURES,
  forceShow = false,
  className = "",
}) {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(null);
  const [recent, setRecent] = useState([]);
  const inputRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(forceShow);

  useEffect(() => {
    setShouldRender(forceShow || isMockMode());
  }, [forceShow]);

  if (!shouldRender) return null;

  function recordResult(name, status, message) {
    setRecent((prev) =>
      [{ name, status, message, ts: Date.now() }, ...prev].slice(0, 6)
    );
  }

  async function handleFile(file) {
    if (!file) return;
    setBusy(file.name);
    try {
      await postWebhook({ file, filename: file.name });
      toast.success("Sent to webhook", { description: file.name });
      recordResult(file.name, "ok", "Ingested");
    } catch (err) {
      toast.error("Webhook failed", { description: err.message });
      recordResult(file.name, "error", err.message);
    } finally {
      setBusy(null);
    }
  }

  async function handleFixture(name) {
    setBusy(name);
    try {
      await postWebhook({ filename: name });
      toast.success("Fixture sent", { description: name });
      recordResult(name, "ok", "Ingested");
    } catch (err) {
      toast.error("Webhook failed", { description: err.message });
      recordResult(name, "error", err.message);
    } finally {
      setBusy(null);
    }
  }

  function handleDrop(e) {
    e.preventDefault();
    setActive(false);
    const file = e.dataTransfer?.files?.[0];
    if (file) handleFile(file);
  }

  return (
    <div
      className={`rounded-xl bg-white/[0.02] border border-white/[0.06] overflow-hidden ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
            <MessageSquare size={11} className="text-emerald-400" />
          </div>
          <div>
            <p className="text-[11px] text-white font-semibold tracking-tight">
              WhatsApp Mock Panel
            </p>
            <p className="text-[9px] text-slate-600 font-mono">
              Offline demo path
            </p>
          </div>
        </div>
        <span className="text-[9px] text-emerald-300 font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20">
          mock
        </span>
      </div>

      <div className="p-4 grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Drop zone */}
        <div className="md:col-span-2">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setActive(true);
            }}
            onDragLeave={() => setActive(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            className={`relative h-44 rounded-lg border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-colors ${
              active
                ? "border-emerald-500/50 bg-emerald-500/5"
                : "border-white/[0.10] hover:border-white/[0.18] hover:bg-white/[0.02]"
            }`}
          >
            <Upload
              size={20}
              className={active ? "text-emerald-400" : "text-slate-500"}
            />
            <p className="mt-2 text-[11px] text-slate-300 font-medium">
              Drop a challan image
            </p>
            <p className="text-[9px] text-slate-600 mt-0.5">
              or click to browse
            </p>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
                e.target.value = "";
              }}
            />
          </div>

          {/* Recent results */}
          <div className="mt-3 space-y-1">
            <AnimatePresence initial={false}>
              {recent.map((r) => (
                <motion.div
                  key={`${r.ts}-${r.name}`}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 text-[10px]"
                >
                  {r.status === "ok" ? (
                    <CheckCircle2
                      size={10}
                      className="text-emerald-400 shrink-0"
                    />
                  ) : (
                    <AlertCircle
                      size={10}
                      className="text-rose-400 shrink-0"
                    />
                  )}
                  <span className="text-slate-400 font-mono truncate">
                    {r.name}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Fixture list */}
        <div className="md:col-span-3">
          <p className="text-[9px] text-slate-600 uppercase tracking-widest font-semibold mb-2">
            {fixtures.length} fixtures available
          </p>
          <div className="grid grid-cols-2 gap-1.5 max-h-52 overflow-y-auto pr-1">
            {fixtures.map((name) => {
              const isBusy = busy === name;
              return (
                <button
                  key={name}
                  type="button"
                  disabled={!!busy}
                  onClick={() => handleFixture(name)}
                  className="group flex items-center gap-2 px-2.5 py-2 rounded-md bg-white/[0.02] hover:bg-white/[0.06] border border-white/[0.06] hover:border-white/[0.12] text-left transition-colors disabled:opacity-50 disabled:cursor-wait"
                >
                  {isBusy ? (
                    <Loader2
                      size={11}
                      className="text-emerald-400 animate-spin shrink-0"
                    />
                  ) : (
                    <ImageIcon
                      size={11}
                      className="text-slate-500 group-hover:text-slate-300 shrink-0"
                    />
                  )}
                  <span className="text-[10px] text-slate-400 group-hover:text-white font-mono truncate">
                    {name}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

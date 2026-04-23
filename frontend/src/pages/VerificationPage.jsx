import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  ExternalLink,
  Hash,
  Calendar,
} from "lucide-react";
import { api, ApiError } from "../lib/api.js";
import DocumentStatePill from "../components/invoices/DocumentStatePill.jsx";
import ConfidenceBar from "../components/invoices/ConfidenceBar.jsx";

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * Public verification page linked from PDF QR codes.
 * Renders ZERO PII (no vendor name, no amount).
 */
export default function VerificationPage() {
  const { id } = useParams();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await api(`/public/verify/${id}`);
        if (mounted) setData(res);
      } catch (err) {
        if (mounted) {
          if (err instanceof ApiError && err.status === 404) {
            setError("Document not found.");
          } else {
            setError("This verification link is invalid or has expired.");
          }
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }
    load();
    return () => {
      mounted = false;
    };
  }, [id]);

  const verified =
    data?.state === "VERIFIED" || data?.state === "SUBMITTED_TO_GOV";

  return (
    <div className="min-h-screen bg-white text-zinc-700 font-sans flex flex-col">
      {/* Top brand strip */}
      <header className="border-b border-zinc-200 bg-white">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 flex items-center justify-center">
            <Shield size={15} className="text-white" strokeWidth={2.5} />
          </div>
          <span className="text-zinc-900 font-bold text-[14px] tracking-tight">
            TrustAudit
          </span>
          <span className="text-[10px] text-zinc-600 font-semibold px-1.5 py-0.5 rounded-md bg-zinc-50 border border-zinc-200">
            Public verification
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-5 py-10">
        <div className="w-full max-w-[580px] space-y-4">
          {loading && (
            <div className="glass rounded-2xl p-12 text-center">
              <div className="w-6 h-6 mx-auto rounded-full border-2 border-zinc-200 border-t-zinc-900 animate-spin" />
              <p className="mt-3 text-[11px] text-zinc-500">
                Verifying document…
              </p>
            </div>
          )}

          {!loading && error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-8 text-center"
            >
              <div className="w-12 h-12 mx-auto rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center">
                <ShieldAlert size={20} className="text-red-700" />
              </div>
              <p className="mt-3 text-[14px] text-zinc-900 font-bold tracking-tight">
                Cannot verify
              </p>
              <p className="mt-1 text-[11px] text-zinc-500">{error}</p>
            </motion.div>
          )}

          {!loading && data && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
              className="glass rounded-2xl overflow-hidden"
            >
              {/* Hero */}
              <div className="px-6 py-8 text-center border-b border-zinc-200">
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 220,
                    damping: 20,
                    delay: 0.1,
                  }}
                  className={`mx-auto w-16 h-16 rounded-2xl flex items-center justify-center border ${
                    verified
                      ? "bg-emerald-50 border-emerald-200"
                      : "bg-amber-50 border-amber-200"
                  }`}
                >
                  <ShieldCheck
                    size={26}
                    className={
                      verified ? "text-emerald-700" : "text-amber-700"
                    }
                    strokeWidth={2.2}
                  />
                </motion.div>
                <p className="mt-4 text-[18px] text-zinc-900 font-bold tracking-tight">
                  {verified ? "Proof bundle verified" : "Pending verification"}
                </p>
                <p className="mt-1 text-[11px] text-zinc-500">
                  This document was generated by TrustAudit on{" "}
                  <span className="text-zinc-700">
                    {formatDate(data.generated_at || data.created_at)}
                  </span>
                </p>
                <div className="mt-3 flex justify-center">
                  <DocumentStatePill state={data.state} />
                </div>
              </div>

              {/* Facts (no PII) */}
              <div className="px-6 py-5 space-y-4">
                <Fact
                  icon={Hash}
                  label="Audit hash"
                  value={data.audit_hash}
                  mono
                />
                <Fact
                  icon={Calendar}
                  label="Date of acceptance"
                  value={formatDate(data.date_of_acceptance)}
                />

                <div>
                  <p className="text-[10px] text-zinc-500 uppercase tracking-widest mb-1.5">
                    Confidence score
                  </p>
                  <ConfidenceBar
                    confidence={data.confidence_score}
                    width={300}
                  />
                </div>

                {data.submitted_to_gov_at && (
                  <Fact
                    icon={ShieldCheck}
                    label="Included in audit-ready proof bundle"
                    value={formatDate(data.submitted_to_gov_at)}
                    accent
                  />
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-zinc-200 bg-zinc-50 flex items-center justify-between">
                <p className="text-[9px] text-zinc-500 leading-snug">
                  No personal data is shared on this public page.
                </p>
                <a
                  href="https://trustaudit.in"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-zinc-500 hover:text-zinc-900 transition-colors"
                >
                  trustaudit.in
                  <ExternalLink size={9} />
                </a>
              </div>
            </motion.div>
          )}
        </div>
      </main>
    </div>
  );
}

function Fact({ icon: Icon, label, value, mono, accent }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-7 h-7 rounded-md bg-zinc-50 border border-zinc-200 flex items-center justify-center shrink-0">
        <Icon size={12} className={accent ? "text-emerald-700" : "text-zinc-500"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
          {label}
        </p>
        <p
          className={`text-[12px] mt-0.5 break-all ${
            accent ? "text-emerald-700 font-semibold" : "text-zinc-900"
          } ${mono ? "font-mono text-[11px]" : ""}`}
        >
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

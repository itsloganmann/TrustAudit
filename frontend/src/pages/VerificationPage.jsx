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
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-400 font-sans flex flex-col">
      {/* Top brand strip */}
      <header className="border-b border-white/[0.06] bg-slate-950/70 backdrop-blur-xl">
        <div className="max-w-[680px] mx-auto px-5 h-14 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
            <Shield size={15} className="text-slate-950" strokeWidth={2.5} />
          </div>
          <span className="text-white font-bold text-[14px] tracking-tight">
            TrustAudit
          </span>
          <span className="text-[10px] text-slate-500 font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08]">
            Public verification
          </span>
        </div>
      </header>

      <main className="flex-1 flex items-start justify-center px-5 py-10">
        <div className="w-full max-w-[580px] space-y-4">
          {loading && (
            <div className="glass rounded-2xl p-12 text-center">
              <div className="w-6 h-6 mx-auto rounded-full border-2 border-white/[0.08] border-t-white animate-spin" />
              <p className="mt-3 text-[11px] text-slate-600">
                Verifying document...
              </p>
            </div>
          )}

          {!loading && error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-8 text-center"
            >
              <div className="w-12 h-12 mx-auto rounded-2xl bg-rose-500/10 border border-rose-500/25 flex items-center justify-center">
                <ShieldAlert size={20} className="text-rose-400" />
              </div>
              <p className="mt-3 text-[14px] text-white font-bold tracking-tight">
                Cannot verify
              </p>
              <p className="mt-1 text-[11px] text-slate-500">{error}</p>
            </motion.div>
          )}

          {!loading && data && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: "spring", stiffness: 280, damping: 28 }}
              className="glass rounded-2xl overflow-hidden"
              style={{
                boxShadow: verified
                  ? "0 20px 60px -20px rgba(16,185,129,0.35), 0 0 0 1px rgba(16,185,129,0.18) inset"
                  : "0 20px 60px -20px rgba(0,0,0,0.5)",
              }}
            >
              {/* Hero */}
              <div className="px-6 py-8 text-center border-b border-white/[0.06]">
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
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : "bg-amber-500/10 border-amber-500/30"
                  }`}
                  style={
                    verified
                      ? {
                          boxShadow:
                            "0 0 30px rgba(16,185,129,0.35), 0 0 60px rgba(16,185,129,0.18)",
                        }
                      : undefined
                  }
                >
                  <ShieldCheck
                    size={26}
                    className={
                      verified ? "text-emerald-400" : "text-amber-400"
                    }
                    strokeWidth={2.2}
                  />
                </motion.div>
                <p className="mt-4 text-[18px] text-white font-bold tracking-tight">
                  {verified ? "Document Verified" : "Pending Verification"}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  This document was generated by TrustAudit on{" "}
                  <span className="text-slate-300">
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
                  <p className="text-[10px] text-slate-500 uppercase tracking-widest mb-1.5">
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
                    label="Filed with government"
                    value={formatDate(data.submitted_to_gov_at)}
                    accent
                  />
                )}
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-white/[0.06] bg-white/[0.02] flex items-center justify-between">
                <p className="text-[9px] text-slate-600 leading-snug">
                  No personal data is shared on this public page.
                </p>
                <a
                  href="https://trustaudit.in"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[10px] text-slate-400 hover:text-white transition-colors"
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
      <div className="w-7 h-7 rounded-md bg-white/[0.04] border border-white/[0.08] flex items-center justify-center shrink-0">
        <Icon size={12} className={accent ? "text-emerald-400" : "text-slate-500"} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest">
          {label}
        </p>
        <p
          className={`text-[12px] mt-0.5 break-all ${
            accent ? "text-emerald-300 font-semibold" : "text-slate-200"
          } ${mono ? "font-mono text-[11px]" : ""}`}
        >
          {value || "—"}
        </p>
      </div>
    </div>
  );
}

import { useState, useEffect, useCallback, useRef } from "react";
// eslint-disable-next-line no-unused-vars
import { motion, useReducedMotion } from "framer-motion";
import { Toaster, toast } from "sonner";
// eslint-disable-next-line no-unused-vars
import { Search, Activity } from "lucide-react";
import Dashboard from "./components/Dashboard";
import ExamplePipeline from "./components/ExamplePipeline";
import SupplierNetwork from "./components/SupplierNetwork";
import InvoiceDetailSheet from "./components/InvoiceDetailSheet";
import AnimatedCounter from "./components/AnimatedCounter";
import AmbientBackground from "./components/AmbientBackground";
import { useVendorLiveStatus } from "./components/shell/vendorLiveStatus.js";

const API = "/api";
// Hotfix: SSE frames trigger toasts via LiveInvoiceStream but they do NOT
// re-fetch dashboard data, so the prior "slow polling when SSE is open"
// behaviour caused new invoices to take up to 15s to appear. Always poll
// at 2s — SSE then provides the layered toast feedback on top.
const POLL_INTERVAL_FAST_MS = 2000;

function App() {
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState({});
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");
  const shouldReduceMotion = useReducedMotion();

  // SSE status is read just so we can surface it elsewhere if needed; the
  // polling cadence is now constant at 2s regardless of SSE state.
  // eslint-disable-next-line no-unused-vars
  const liveStatus = useVendorLiveStatus();
  const pollIntervalMs = POLL_INTERVAL_FAST_MS;

  // Track previous invoice statuses for toast detection
  const prevStatusMap = useRef({});

  const fetchData = useCallback(async () => {
    try {
      const [a, b, c] = await Promise.all([
        fetch(`${API}/invoices`).then((r) => r.json()),
        fetch(`${API}/stats`).then((r) => r.json()),
        fetch(`${API}/activity`).then((r) => r.json()),
      ]);

      // Detect newly verified invoices for Sonner toast
      const prevMap = prevStatusMap.current;
      if (Object.keys(prevMap).length > 0) {
        a.forEach((inv) => {
          if (prevMap[inv.id] === "PENDING" && inv.status === "VERIFIED") {
            toast.success(
              `Tax Shield Secured: INR ${inv.invoice_amount.toLocaleString("en-IN")} deduction protected.`,
              {
                description: `${inv.vendor_name} -- ${inv.invoice_number}`,
                duration: 6000,
              }
            );
          }
        });
      }

      // Update status map
      const newMap = {};
      a.forEach((inv) => {
        newMap[inv.id] = inv.status;
      });
      prevStatusMap.current = newMap;

      setInvoices(a);
      setStats(b);
      setActivity(c);
      setLoading(false);
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const i = setInterval(fetchData, pollIntervalMs);
    return () => clearInterval(i);
  }, [fetchData, pollIntervalMs]);

  // Filter logic
  const filtered = invoices.filter((inv) => {
    const matchTab =
      tab === "all" ||
      (tab === "critical" && inv.status === "PENDING" && inv.days_remaining <= 3) ||
      (tab === "warning" && inv.status === "PENDING" && inv.days_remaining > 3 && inv.days_remaining <= 14) ||
      (tab === "pending" && inv.status === "PENDING" && inv.days_remaining > 14) ||
      (tab === "verified" && inv.status === "VERIFIED");
    const matchSearch =
      !search ||
      inv.vendor_name.toLowerCase().includes(search.toLowerCase()) ||
      inv.gstin.toLowerCase().includes(search.toLowerCase()) ||
      inv.invoice_number.toLowerCase().includes(search.toLowerCase());
    return matchTab && matchSearch;
  });

  const tabCounts = {
    all: invoices.length,
    critical: invoices.filter((i) => i.status === "PENDING" && i.days_remaining <= 3).length,
    warning: invoices.filter((i) => i.status === "PENDING" && i.days_remaining > 3 && i.days_remaining <= 14).length,
    pending: invoices.filter((i) => i.status === "PENDING" && i.days_remaining > 14).length,
    verified: invoices.filter((i) => i.status === "VERIFIED").length,
  };

  return (
    <div className="min-h-screen bg-[#06070f] text-violet-100/70 font-sans">
      {/* Ambient background — mounts once, behind everything */}
      <AmbientBackground />

      {/* All interactive content sits above the ambient canvas */}
      <div className="relative" style={{ zIndex: 1 }}>
      {/* Sonner Toast Provider */}
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#0f172a",
            border: "1px solid rgba(16, 185, 129, 0.2)",
            color: "#f8fafc",
            fontSize: "13px",
            fontWeight: 500,
          },
          className: "font-sans",
        }}
        theme="dark"
      />

      {/* Live Ticker Strip */}
      <div className="h-9 bg-[#06070f]/85 border-b border-violet-500/10 overflow-hidden flex items-center backdrop-blur-md">
        <div className="ticker-scroll flex items-center gap-10 whitespace-nowrap px-6">
          {invoices
            .filter((i) => i.status === "PENDING" && i.days_remaining <= 3)
            .map((inv, i) => (
              <span key={`t1-${i}`} className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#fb7185] pulse-dot" />
                <span className="text-[#fb7185] font-semibold">{inv.vendor_name}</span>
                <span className="text-violet-300/40">₹{inv.invoice_amount.toLocaleString("en-IN")}</span>
                <span className="text-violet-300/30">·</span>
                <span className="text-[#fb7185]">
                  {inv.days_remaining <= 0 ? "OVERDUE" : `${inv.days_remaining}d left`}
                </span>
              </span>
            ))}
          {invoices
            .filter((i) => i.status === "VERIFIED")
            .slice(0, 5)
            .map((inv, i) => (
              <span key={`t2-${i}`} className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#34d399]" />
                <span className="text-[#34d399] font-semibold">{inv.vendor_name}</span>
                <span className="text-violet-300/40">₹{inv.invoice_amount.toLocaleString("en-IN")}</span>
                <span className="text-violet-300/30">·</span>
                <span className="text-[#34d399]">Secured</span>
              </span>
            ))}
          {/* Duplicate for seamless scroll */}
          {invoices
            .filter((i) => i.status === "PENDING" && i.days_remaining <= 3)
            .map((inv, i) => (
              <span key={`t3-${i}`} className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-[#fb7185] pulse-dot" />
                <span className="text-[#fb7185] font-semibold">{inv.vendor_name}</span>
                <span className="text-violet-300/40">₹{inv.invoice_amount.toLocaleString("en-IN")}</span>
                <span className="text-violet-300/30">·</span>
                <span className="text-[#fb7185]">
                  {inv.days_remaining <= 0 ? "OVERDUE" : `${inv.days_remaining}d left`}
                </span>
              </span>
            ))}
        </div>
      </div>

      {/* Header — round 5 Aurora */}
      <header className="border-b border-violet-500/10 bg-[#06070f]/80 backdrop-blur-2xl sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-8 h-20 flex items-center justify-between">
          {/* Left: Brand */}
          <div className="flex items-center gap-3">
            <div className="relative w-10 h-10 rounded-md bg-gradient-to-br from-violet-400 via-fuchsia-400 to-amber-300 flex items-center justify-center shadow-[0_0_30px_-4px_rgba(167,139,250,0.6)]">
              <span className="aurora-headline text-[20px] text-[#06070f] leading-none">A</span>
            </div>
            <div className="flex flex-col">
              <span className="aurora-headline text-[22px] text-white leading-none">
                TrustAudit
              </span>
              <span className="font-mono text-[9px] text-violet-300/70 tracking-[0.3em] uppercase mt-0.5">
                Dashboard · CFO
              </span>
            </div>
          </div>

          {/* Center: Key metrics */}
          <div className="flex items-stretch gap-6">
            <MetricBlock label="Portfolio" value={stats.total_value || 0} prefix="INR " />
            <div className="w-px bg-violet-500/15" />
            <MetricBlock label="Saved" value={stats.liability_saved || 0} prefix="INR " accent="#34d399" />
            <div className="w-px bg-violet-500/15" />
            <MetricBlock label="At Risk" value={stats.total_at_risk || 0} prefix="INR " accent="#fb7185" />
            <div className="w-px bg-violet-500/15" />
            <div className="flex flex-col justify-center">
              <p className="font-mono text-[9px] text-violet-300/60 uppercase tracking-[0.25em]">
                Compliance
              </p>
              <p className="aurora-headline text-[28px] text-[#fbbf24] tabular-nums leading-none mt-1">
                {stats.compliance_rate || 0}
                <span className="text-[16px] text-violet-300/60">%</span>
              </p>
            </div>
          </div>

          {/* Right: Live indicator */}
          <div className="flex items-center gap-3">
            <span className="chip !bg-[#34d399]/8 !border-[#34d399]/30 !text-[#34d399]">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#34d399] opacity-40" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#34d399]" />
              </span>
              Live
            </span>
            <span className="font-mono text-[10px] text-violet-300/60 tabular-nums tracking-wider">
              {stats.total_invoices || 0} invoices
            </span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-[1600px] mx-auto px-8 py-8">
        <div className="space-y-6">
          {/* Tabs + Search */}
          <div className="flex items-center justify-between gap-6">
            <div className="flex items-center gap-2">
              {[
                { key: "all", label: "All" },
                { key: "critical", label: "Critical", color: "#fb7185" },
                { key: "warning", label: "Warning", color: "#fbbf24" },
                { key: "pending", label: "Safe", color: "#a78bfa" },
                { key: "verified", label: "Verified", color: "#34d399" },
              ].map((t) => {
                const isActive = tab === t.key;
                return (
                  <motion.button
                    key={t.key}
                    type="button"
                    onClick={() => setTab(t.key)}
                    whileHover={shouldReduceMotion ? undefined : { y: -1 }}
                    whileTap={shouldReduceMotion ? undefined : { scale: 0.97 }}
                    className={`chip ${isActive ? "chip-active" : ""}`}
                  >
                    {t.color && (
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: t.color }}
                      />
                    )}
                    {t.label}
                    <span className="font-mono tabular-nums opacity-60">
                      {tabCounts[t.key]}
                    </span>
                  </motion.button>
                );
              })}
            </div>

            <div className="relative">
              <Search
                size={14}
                className="absolute left-3.5 top-1/2 -translate-y-1/2 text-violet-300/40"
              />
              <input
                type="text"
                placeholder="Search vendor, GSTIN, invoice…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-80 h-10 pl-10 pr-4 font-mono text-[11px] uppercase tracking-wider bg-violet-500/4 border border-violet-500/15 rounded-md text-white placeholder:text-violet-300/30 placeholder:normal-case placeholder:tracking-normal focus:outline-none focus:border-violet-400/50 focus:bg-violet-500/8 transition-all backdrop-blur-md"
              />
            </div>
          </div>

          <Dashboard
            invoices={filtered}
            stats={stats}
            activity={activity}
            loading={loading}
            onSelectInvoice={setSelectedInvoice}
          />

          <SupplierNetwork />

          <ExamplePipeline />
        </div>
      </main>

      {/* Evidence Drawer — kept mounted so InvoiceDetailSheet's AnimatePresence can run exit */}
      <InvoiceDetailSheet
        invoice={selectedInvoice}
        onClose={() => setSelectedInvoice(null)}
      />
      </div>
    </div>
  );
}

function MetricBlock({ label, value, prefix = "", accent }) {
  return (
    <div className="flex flex-col justify-center">
      <p className="font-mono text-[9px] text-violet-300/60 uppercase tracking-[0.25em]">
        {label}
      </p>
      <div className="aurora-headline text-[28px] tabular-nums leading-none mt-1" style={{ color: accent || "#fafafa" }}>
        <AnimatedCounter
          value={value}
          prefix={prefix}
          className="aurora-headline tabular-nums"
          style={{ color: accent || "#fafafa" }}
        />
      </div>
    </div>
  );
}

export default App;

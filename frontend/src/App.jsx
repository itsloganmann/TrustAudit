import { useState, useEffect, useCallback, useRef } from "react";
import { Toaster, toast } from "sonner";
import { Shield, Search, Activity } from "lucide-react";
import Dashboard from "./components/Dashboard";
import ExamplePipeline from "./components/ExamplePipeline";
import SupplierNetwork from "./components/SupplierNetwork";
import InvoiceDetailSheet from "./components/InvoiceDetailSheet";
import AnimatedCounter from "./components/AnimatedCounter";
import AmbientBackground from "./components/AmbientBackground";
import { useVendorLiveStatus } from "./components/shell/vendorLiveStatus.js";

const API = "/api";
// When the Phase I SSE stream is open we slow the REST poll way down because
// the stream itself pushes near-real-time deltas. If SSE is unavailable (or
// the route is mounted outside VendorShell, e.g. during tests) we keep the
// original 2-second cadence so nothing regresses.
const POLL_INTERVAL_FAST_MS = 2000;
const POLL_INTERVAL_SSE_MS = 15000;

function App() {
  const [invoices, setInvoices] = useState([]);
  const [stats, setStats] = useState({});
  const [activity, setActivity] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [tab, setTab] = useState("all");
  const [search, setSearch] = useState("");

  // When mounted inside VendorShell this returns the SSE status; when mounted
  // standalone the default context value ("idle") falls through and polling
  // stays at its original 2s cadence.
  const liveStatus = useVendorLiveStatus();
  const pollIntervalMs =
    liveStatus === "open" ? POLL_INTERVAL_SSE_MS : POLL_INTERVAL_FAST_MS;

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
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-950 to-slate-900 text-slate-400 font-sans">
      {/* Ambient 3D background — mounts once, behind everything */}
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
      <div className="h-8 bg-slate-950/80 border-b border-white/[0.04] overflow-hidden flex items-center backdrop-blur-sm">
        <div className="ticker-scroll flex items-center gap-8 whitespace-nowrap px-4">
          {invoices
            .filter((i) => i.status === "PENDING" && i.days_remaining <= 3)
            .map((inv, i) => (
              <span key={`t1-${i}`} className="flex items-center gap-2 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 pulse-dot" />
                <span className="text-rose-400 font-medium">{inv.vendor_name}</span>
                <span className="text-slate-600">INR {inv.invoice_amount.toLocaleString("en-IN")}</span>
                <span className="text-slate-700">/</span>
                <span className="text-rose-400">
                  {inv.days_remaining <= 0 ? "OVERDUE" : `${inv.days_remaining}d left`}
                </span>
              </span>
            ))}
          {invoices
            .filter((i) => i.status === "VERIFIED")
            .slice(0, 5)
            .map((inv, i) => (
              <span key={`t2-${i}`} className="flex items-center gap-2 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                <span className="text-emerald-400 font-medium">{inv.vendor_name}</span>
                <span className="text-slate-600">INR {inv.invoice_amount.toLocaleString("en-IN")}</span>
                <span className="text-slate-700">/</span>
                <span className="text-emerald-400">Secured</span>
              </span>
            ))}
          {/* Duplicate for seamless scroll */}
          {invoices
            .filter((i) => i.status === "PENDING" && i.days_remaining <= 3)
            .map((inv, i) => (
              <span key={`t3-${i}`} className="flex items-center gap-2 text-[11px]">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-500 pulse-dot" />
                <span className="text-rose-400 font-medium">{inv.vendor_name}</span>
                <span className="text-slate-600">INR {inv.invoice_amount.toLocaleString("en-IN")}</span>
                <span className="text-slate-700">/</span>
                <span className="text-rose-400">
                  {inv.days_remaining <= 0 ? "OVERDUE" : `${inv.days_remaining}d left`}
                </span>
              </span>
            ))}
        </div>
      </div>

      {/* Header */}
      <header className="border-b border-white/[0.06] bg-slate-950/60 backdrop-blur-xl sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 h-16 flex items-center justify-between">
          {/* Left: Brand */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white flex items-center justify-center">
              <Shield size={15} className="text-slate-950" strokeWidth={2.5} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-white font-semibold text-[15px] tracking-tight">
                TrustAudit
              </span>
              <span className="text-[10px] text-slate-500 font-semibold px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08]">
                43B(h)
              </span>
            </div>
          </div>

          {/* Center: Key metrics */}
          <div className="flex items-center gap-8">
            <Metric label="Portfolio" value={stats.total_value || 0} prefix="INR " />
            <div className="w-px h-8 bg-white/[0.06]" />
            <Metric label="Saved" value={stats.liability_saved || 0} prefix="INR " color="#10b981" glow="emerald" />
            <div className="w-px h-8 bg-white/[0.06]" />
            <Metric label="At Risk" value={stats.total_at_risk || 0} prefix="INR " color="#f43f5e" glow="rose" />
            <div className="w-px h-8 bg-white/[0.06]" />
            <div className="text-right">
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Compliance</p>
              <p className="text-[18px] font-bold text-white tabular-nums leading-tight tracking-tight">
                {stats.compliance_rate || 0}
                <span className="text-[12px] text-slate-600 font-normal">%</span>
              </p>
            </div>
          </div>

          {/* Right: Live indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-40" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Live
            </div>
            <span className="text-[11px] text-slate-700 tabular-nums">
              {stats.total_invoices || 0} invoices
            </span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="max-w-[1600px] mx-auto px-6 py-5">
        <div className="space-y-4">
          {/* Tabs + Search */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1 glass rounded-xl p-0.5">
              {[
                { key: "all", label: "All" },
                { key: "critical", label: "Critical", color: "#f43f5e" },
                { key: "warning", label: "Warning", color: "#f59e0b" },
                { key: "pending", label: "Safe", color: "#3b82f6" },
                { key: "verified", label: "Verified", color: "#10b981" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all flex items-center gap-1.5 ${tab === t.key
                      ? "bg-white/[0.08] text-white border border-white/[0.1]"
                      : "text-slate-500 hover:text-slate-300 border border-transparent"
                    }`}
                >
                  {t.color && (
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: t.color }}
                    />
                  )}
                  {t.label}
                  <span
                    className={`text-[10px] tabular-nums ${tab === t.key ? "text-slate-400" : "text-slate-600"
                      }`}
                  >
                    {tabCounts[t.key]}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative">
              <Search
                size={14}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-600"
              />
              <input
                type="text"
                placeholder="Search vendor, GSTIN, invoice..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-72 h-8 pl-9 pr-3 text-[12px] bg-white/[0.03] border border-white/[0.06] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:border-white/[0.12] transition-colors backdrop-blur-sm"
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

      {/* Evidence Drawer */}
      {selectedInvoice && (
        <InvoiceDetailSheet
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
      </div>
    </div>
  );
}

function Metric({ label, value, prefix = "", color, glow }) {
  return (
    <div className="text-right">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest">{label}</p>
      <AnimatedCounter
        value={value}
        prefix={prefix}
        className={`text-[18px] font-bold tabular-nums leading-tight tracking-tight ${glow === "emerald" ? "glow-emerald" : glow === "rose" ? "glow-rose" : ""
          }`}
        style={{ color: color || "#f8fafc" }}
        duration={1200}
      />
    </div>
  );
}

export default App;

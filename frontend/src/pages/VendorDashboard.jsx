import { useEffect, useMemo, useState } from "react";
import { Toaster } from "sonner";
import Dashboard from "../components/Dashboard.jsx";
import InvoiceDetailSheet from "../components/InvoiceDetailSheet.jsx";
import WhatsAppMockPanel from "../components/mock/WhatsAppMockPanel.jsx";
import ProviderHealthPanel from "../components/mock/ProviderHealthPanel.jsx";
import { useInvoices } from "../hooks/useInvoices.js";
import { api } from "../lib/api.js";

function isMockMode() {
  if (typeof import.meta === "undefined" || !import.meta.env) return false;
  return import.meta.env.VITE_WHATSAPP_PROVIDER === "mock";
}

/**
 * VendorDashboard composes the existing Dashboard + new mock/health panels.
 * It deliberately does NOT modify Dashboard.jsx — only wraps it.
 */
export default function VendorDashboard() {
  const { invoices, loading } = useInvoices({ pollMs: 4000 });
  const [stats, setStats] = useState({});
  const [activity, setActivity] = useState([]);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [mock] = useState(isMockMode());

  // Stats + activity polling (Dashboard expects them)
  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const [s, a] = await Promise.all([
          api("/stats").catch(() => ({})),
          api("/activity").catch(() => []),
        ]);
        if (!mounted) return;
        setStats(s || {});
        setActivity(Array.isArray(a) ? a : []);
      } catch {
        /* ignore */
      }
    }
    load();
    const i = setInterval(load, 4000);
    return () => {
      mounted = false;
      clearInterval(i);
    };
  }, []);

  // Map new invoice schema → legacy Dashboard prop shape
  const dashboardInvoices = useMemo(
    () =>
      invoices.map((inv) => ({
        ...inv,
        // Dashboard.jsx expects `status`, fall back to `state` if needed.
        status:
          inv.status ||
          (inv.state === "VERIFIED" || inv.state === "SUBMITTED_TO_GOV"
            ? "VERIFIED"
            : "PENDING"),
      })),
    [invoices]
  );

  return (
    <div className="min-h-screen bg-white text-zinc-700 font-sans">
      <Toaster
        position="top-right"
        toastOptions={{
          style: {
            background: "#ffffff",
            border: "1px solid #e4e4e7",
            color: "#09090b",
            fontSize: "13px",
            fontWeight: 500,
          },
          className: "font-sans",
        }}
        theme="light"
      />

      <main className="max-w-[1600px] mx-auto px-6 py-5 space-y-4">
        {/* Provider health pinned at top */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <h1 className="text-[18px] font-bold text-zinc-900 tracking-tight">
              AP decision dashboard
            </h1>
            <p className="text-[11px] text-zinc-500 mt-0.5">
              Which supplier invoices are safe to pay, which are disputed, and which still need proof.
            </p>
          </div>
          <ProviderHealthPanel />
        </div>

        {/* Existing dashboard, untouched */}
        <Dashboard
          invoices={dashboardInvoices}
          stats={stats}
          activity={activity}
          loading={loading}
          onSelectInvoice={setSelectedInvoice}
        />

        {/* Offline mock panel */}
        {mock && <WhatsAppMockPanel forceShow />}
      </main>

      {selectedInvoice && (
        <InvoiceDetailSheet
          invoice={selectedInvoice}
          onClose={() => setSelectedInvoice(null)}
        />
      )}
    </div>
  );
}

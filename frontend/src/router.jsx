import { lazy, Suspense } from "react";
import {
  Navigate,
  Outlet,
  RouterProvider,
  createBrowserRouter,
  useLocation,
} from "react-router-dom";

import { useAuth } from "./hooks/useAuth.js";

// ── Public pages ────────────────────────────────────────────────────────────
// Code-split the heavier landing/demo pages so the auth + dashboard chunks
// don't have to ship react-three/fiber.
const Landing = lazy(() => import("./pages/Landing.jsx"));
const LiveDemo = lazy(() => import("./pages/LiveDemo.jsx"));
const About = lazy(() => import("./pages/About.jsx"));
const Privacy = lazy(() => import("./pages/Privacy.jsx"));
const Terms = lazy(() => import("./pages/Terms.jsx"));

// ── Auth pages ──────────────────────────────────────────────────────────────
import VendorSignup from "./pages/VendorSignup.jsx";
import VendorSignin from "./pages/VendorSignin.jsx";
import DriverSignup from "./pages/DriverSignup.jsx";
import DriverSignin from "./pages/DriverSignin.jsx";
import VerifyEmail from "./pages/VerifyEmail.jsx";
import MagicLink from "./pages/MagicLink.jsx";
import DriverOnboarding from "./pages/DriverOnboarding.jsx";

// ── Authenticated shells ────────────────────────────────────────────────────
import VendorShell from "./components/shell/VendorShell.jsx";
import DriverShell from "./components/shell/DriverShell.jsx";

// ── Real vendor dashboard (existing App.jsx mounted under /vendor) ─────────
import App from "./App.jsx";

// =============================================================================
// Route guards
// =============================================================================

function FullPageSpinner() {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-white/[0.08] border-t-white animate-spin" />
    </div>
  );
}

/**
 * Route guard that requires the user to be signed in with the matching role.
 *
 * Behavior:
 *  - while loading: minimal spinner (no glass flash)
 *  - signed in & matching role: render children
 *  - signed in but wrong role: redirect to that role's signin page with a hint
 *  - not signed in: redirect to the requested role's signin page
 *
 * @param {{ role: "vendor"|"driver", children: React.ReactNode }} props
 */
export function RequireAuth({ role, children }) {
  const { user, loading } = useAuth();
  const location = useLocation();

  if (loading) return <FullPageSpinner />;

  if (!user) {
    return (
      <Navigate
        to={`/auth/${role}/signin`}
        state={{ from: location.pathname }}
        replace
      />
    );
  }

  if (user.role && user.role !== role) {
    return (
      <Navigate
        to={`/auth/${user.role}/signin`}
        state={{ wrongRole: role, from: location.pathname }}
        replace
      />
    );
  }

  return children;
}

// =============================================================================
// Placeholder home views — W8 will replace these with the real dashboard.
// =============================================================================

function VendorHomePlaceholder() {
  const { user } = useAuth();
  return (
    <div className="space-y-4">
      <div className="glass rounded-2xl p-6">
        <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
          Vendor dashboard
        </p>
        <h1 className="mt-1 text-[24px] text-white font-bold tracking-tight">
          Welcome, {user?.full_name || "CFO"}.
        </h1>
        <p className="mt-2 text-[13px] text-slate-400">
          Your real-time 43B(h) compliance shield is live. The full dashboard
          (W8) renders here.
        </p>
      </div>
    </div>
  );
}

function VendorPlaceholder({ title, copy }) {
  return (
    <div className="glass rounded-2xl p-6">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
        Coming soon
      </p>
      <h1 className="mt-1 text-[20px] text-white font-bold tracking-tight">
        {title}
      </h1>
      <p className="mt-2 text-[13px] text-slate-400">{copy}</p>
    </div>
  );
}

function DriverHomePlaceholder() {
  const { user } = useAuth();
  return (
    <div className="glass rounded-2xl p-6">
      <p className="text-[10px] text-slate-500 uppercase tracking-widest font-semibold">
        My submissions
      </p>
      <h1 className="mt-1 text-[22px] text-white font-bold tracking-tight">
        Welcome, {user?.full_name || "driver"}.
      </h1>
      <p className="mt-2 text-[13px] text-slate-400">
        Send your first challan via WhatsApp using the green button above.
        Your submissions will appear here in real time.
      </p>
    </div>
  );
}

function DriverJoinLanding() {
  // The /driver/join/:token route is just a magic-link landing for QR codes.
  // Delegate to MagicLink which handles token consumption + role redirect.
  return <MagicLink />;
}

// =============================================================================
// Router definition
// =============================================================================

export const router = createBrowserRouter([
  // Public
  {
    path: "/",
    element: (
      <Suspense fallback={<FullPageSpinner />}>
        <Landing />
      </Suspense>
    ),
  },
  {
    path: "/live",
    element: (
      <Suspense fallback={<FullPageSpinner />}>
        <LiveDemo />
      </Suspense>
    ),
  },
  {
    path: "/about",
    element: (
      <Suspense fallback={<FullPageSpinner />}>
        <About />
      </Suspense>
    ),
  },
  {
    path: "/privacy",
    element: (
      <Suspense fallback={<FullPageSpinner />}>
        <Privacy />
      </Suspense>
    ),
  },
  {
    path: "/terms",
    element: (
      <Suspense fallback={<FullPageSpinner />}>
        <Terms />
      </Suspense>
    ),
  },

  // Auth
  { path: "/auth/vendor/signup", element: <VendorSignup /> },
  { path: "/auth/vendor/signin", element: <VendorSignin /> },
  { path: "/auth/driver/signup", element: <DriverSignup /> },
  { path: "/auth/driver/signin", element: <DriverSignin /> },
  { path: "/auth/verify-email/:token", element: <VerifyEmail /> },
  { path: "/auth/magic/:token", element: <MagicLink /> },

  // Driver onboarding (post-signup, no shell yet)
  { path: "/driver/onboarding", element: <DriverOnboarding /> },
  { path: "/driver/join/:token", element: <DriverJoinLanding /> },

  // Vendor (authenticated)
  {
    path: "/vendor",
    element: (
      <RequireAuth role="vendor">
        <VendorShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <App /> },
      {
        path: "invoices/:id",
        element: (
          <VendorPlaceholder
            title="Invoice detail"
            copy="The invoice detail drawer (W8) renders here as a real route."
          />
        ),
      },
      {
        path: "disputes",
        element: (
          <VendorPlaceholder
            title="Dispute queue"
            copy="W8 will mount the dispute resolution chat thread for each invoice here."
          />
        ),
      },
      {
        path: "analytics",
        element: (
          <VendorPlaceholder
            title="Loss analytics"
            copy="W8 ships the loss-by-supplier heatmap and aging buckets here."
          />
        ),
      },
      {
        path: "settings",
        element: (
          <VendorPlaceholder
            title="Account settings"
            copy="Manage your enterprise team, linked identities (Google, WhatsApp, magic link) and notification preferences."
          />
        ),
      },
    ],
  },

  // Driver (authenticated)
  {
    path: "/driver",
    element: (
      <RequireAuth role="driver">
        <DriverShell />
      </RequireAuth>
    ),
    children: [{ index: true, element: <DriverHomePlaceholder /> }],
  },

  // Catch-all
  { path: "*", element: <Navigate to="/" replace /> },
]);

/**
 * Convenience top-level router component. Wrap with `<AuthProvider>` outside
 * (see manager-queue request for main.jsx wiring).
 */
export default function AppRouter() {
  return <RouterProvider router={router} />;
}

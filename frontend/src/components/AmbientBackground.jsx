import { Suspense, lazy, useEffect, useState } from "react";

// Lazy-load the three.js scene so it only ships when actually rendered
// (reduced-motion and SSR-ish fallbacks avoid downloading three).
const AmbientScene = lazy(() => import("./AmbientScene"));

/**
 * AmbientBackground
 *
 * Fixed-position, full-screen backdrop that renders either:
 *   - A GPU-cheap animated three.js displacement plane (default), or
 *   - A static radial-gradient div when prefers-reduced-motion is set.
 *
 * Mount once at the top of any dashboard view. Must sit beneath
 * interactive content (z-index: 0, pointer-events: none handled in CSS).
 */
export default function AmbientBackground() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    if (mq.addEventListener) {
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }
    // Safari <14 fallback
    mq.addListener(update);
    return () => mq.removeListener(update);
  }, []);

  // Static gradient fallback — this is ALSO the visual baseline
  // even when the 3D scene mounts, so there is never a flash of empty bg.
  if (reducedMotion) {
    return <div className="ambient-bg" aria-hidden="true" />;
  }

  return (
    <div className="ambient-bg" aria-hidden="true">
      <Suspense fallback={null}>
        <AmbientScene />
      </Suspense>
    </div>
  );
}

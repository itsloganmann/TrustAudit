/**
 * AmbientBackground — round 5 Aurora.
 *
 * Pure CSS now: no three.js, no shader, no canvas. The .ambient-bg
 * class in index.css renders three drifting violet/fuchsia radial
 * blobs over a near-black base. Cheap, beautiful, and identical
 * across browsers.
 *
 * Mounts once at the top of any dashboard view. Sits beneath
 * interactive content (z-index: 0, pointer-events: none).
 */
export default function AmbientBackground() {
  return <div className="ambient-bg" aria-hidden="true" />;
}

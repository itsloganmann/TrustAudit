/**
 * AmbientBackground — neutralized on the light theme.
 *
 * This used to paint a dark drifting aurora. On the light theme the
 * whole surface is white, so this renders nothing — it stays mounted
 * for API compatibility (callers import and place it at the top of
 * dashboards) but has no visual effect.
 */
export default function AmbientBackground() {
  return null;
}

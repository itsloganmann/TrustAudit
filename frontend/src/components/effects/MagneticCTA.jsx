/**
 * MagneticCTA — pass-through wrapper on the light theme.
 *
 * The pre-migration implementation applied a spring-interpolated
 * offset to the wrapped children when the pointer approached. The
 * product surface is restrained now, so we drop the drag math and
 * just render the children inside an `inline-flex` span. Imports
 * and prop shape stay stable so call sites don't need to change.
 */
export default function MagneticCTA({ children, className = "" }) {
  return <span className={`inline-flex ${className}`}>{children}</span>;
}

/**
 * MagneticCTA — anchor/button wrapper that pulls toward the cursor
 * when the pointer is within ``radius`` pixels of the element bounds.
 *
 * Reuses framer-motion's ``useMotionValue`` + ``useSpring`` so we can
 * spring-interpolate the offset without re-rendering on every move.
 *
 * Respects ``prefers-reduced-motion``: when the OS-level toggle is on,
 * we render the children unwrapped (no listeners, no transforms).
 *
 * Usage:
 *   <MagneticCTA strength={0.4} radius={100}>
 *     <a href="..." className="...">CTA</a>
 *   </MagneticCTA>
 *
 * The wrapper is a ``<motion.div>`` with ``display: inline-flex`` so
 * it doesn't disturb existing layout.
 */
import { useEffect, useRef } from "react";
import { motion, useMotionValue, useSpring, useReducedMotion } from "framer-motion";

const SPRING = { stiffness: 220, damping: 18, mass: 0.4 };

export default function MagneticCTA({
  children,
  strength = 0.35,
  radius = 90,
  className = "",
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef(null);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, SPRING);
  const sy = useSpring(y, SPRING);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const node = ref.current;
    if (!node) return undefined;

    const onMove = (e) => {
      const rect = node.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx;
      const dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      if (dist > radius + Math.max(rect.width, rect.height) / 2) {
        x.set(0);
        y.set(0);
        return;
      }
      x.set(dx * strength);
      y.set(dy * strength);
    };

    const onLeave = () => {
      x.set(0);
      y.set(0);
    };

    window.addEventListener("pointermove", onMove);
    node.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      node.removeEventListener("pointerleave", onLeave);
    };
  }, [radius, reduceMotion, strength, x, y]);

  if (reduceMotion) {
    return <div className={`inline-flex ${className}`}>{children}</div>;
  }

  return (
    <motion.div
      ref={ref}
      style={{ x: sx, y: sy }}
      className={`inline-flex will-change-transform ${className}`}
    >
      {children}
    </motion.div>
  );
}

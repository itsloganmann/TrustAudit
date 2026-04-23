/**
 * TiltCard — wraps a card-shaped child and applies a subtle 3D tilt
 * keyed to the cursor position relative to the card center.
 *
 * Implementation notes:
 * - Uses ``transform-style: preserve-3d`` + ``perspective`` for the
 *   real 3D look without a separate canvas.
 * - The tilt is bounded to ±``maxTilt`` degrees so it never feels
 *   gimmicky.
 * - On pointerleave we spring the angles back to 0.
 * - Respects ``prefers-reduced-motion`` — falls back to a plain div.
 *
 * Usage:
 *   <TiltCard className="frost-card p-6">
 *     ...card content...
 *   </TiltCard>
 */
import { useRef } from "react";
import { motion, useMotionValue, useSpring, useTransform, useReducedMotion } from "framer-motion";

const SPRING = { stiffness: 260, damping: 22, mass: 0.5 };

export default function TiltCard({
  children,
  maxTilt = 6,
  scale = 1.015,
  className = "",
  glare = false,
}) {
  const reduceMotion = useReducedMotion();
  const ref = useRef(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, SPRING);
  const sy = useSpring(py, SPRING);

  const rotateY = useTransform(sx, [0, 1], [-maxTilt, maxTilt]);
  const rotateX = useTransform(sy, [0, 1], [maxTilt, -maxTilt]);
  const glareX = useTransform(sx, [0, 1], ["0%", "100%"]);
  const glareY = useTransform(sy, [0, 1], ["0%", "100%"]);

  // Hooks below MUST be called unconditionally (rules-of-hooks). The
  // glare gradient transform is computed regardless of whether glare is
  // enabled — its result is just unused in the no-glare case. On light
  // theme we keep the glare barely visible so cards stay flat.
  const glareBg = useTransform(
    [glareX, glareY],
    ([gx, gy]) =>
      `radial-gradient(360px circle at ${gx} ${gy}, rgba(16,185,129,0.05), transparent 55%)`,
  );

  if (reduceMotion) {
    return <div className={className}>{children}</div>;
  }

  const handleMove = (e) => {
    const node = ref.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    px.set(Math.min(1, Math.max(0, x)));
    py.set(Math.min(1, Math.max(0, y)));
  };

  const handleLeave = () => {
    px.set(0.5);
    py.set(0.5);
  };

  return (
    <motion.div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      style={{
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
        perspective: 800,
      }}
      whileHover={{ scale }}
      transition={{ type: "spring", stiffness: 300, damping: 28 }}
      className={`relative will-change-transform ${className}`}
    >
      {children}
      {glare && (
        <motion.div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-[inherit] mix-blend-screen"
          style={{ background: glareBg }}
        />
      )}
    </motion.div>
  );
}

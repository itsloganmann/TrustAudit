import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

/**
 * Hero visual for the landing page. We do NOT pull in three.js here —
 * @react-three/fiber is not in package.json and W4 cannot add deps.
 * Instead we render a layered, animated SVG glass shield with
 * concentric orbits, a shimmer sweep, and a soft emerald glow. It
 * plays nicely with Suspense (it has no async work) and matches the
 * dashboard's slate/emerald palette.
 *
 * TODO: swap for three.js / @react-three/fiber once W6 (or a manager
 * approval) adds the dep — a file is queued for that request.
 */
export default function ShieldHero3D() {
  return (
    <div className="relative w-full aspect-square max-w-[520px] mx-auto">
      {/* Ambient outer glow */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(16,185,129,0.28) 0%, rgba(16,185,129,0.08) 35%, transparent 70%)",
          filter: "blur(40px)",
        }}
        animate={{ scale: [1, 1.06, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Rotating orbit rings */}
      <motion.svg
        viewBox="0 0 400 400"
        className="absolute inset-0 w-full h-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="ring1" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.6" />
            <stop offset="50%" stopColor="#3b82f6" stopOpacity="0.15" />
            <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ring2" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#8b5cf6" stopOpacity="0.4" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.0" />
          </linearGradient>
          <radialGradient id="shieldFill" cx="50%" cy="45%" r="60%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="55%" stopColor="rgba(16,185,129,0.12)" />
            <stop offset="100%" stopColor="rgba(15,23,42,0.55)" />
          </radialGradient>
          <linearGradient id="shieldStroke" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.6" />
          </linearGradient>
          <linearGradient id="sweep" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="rgba(255,255,255,0)" />
            <stop offset="50%" stopColor="rgba(255,255,255,0.55)" />
            <stop offset="100%" stopColor="rgba(255,255,255,0)" />
          </linearGradient>
        </defs>

        {/* Outer ring */}
        <motion.circle
          cx="200"
          cy="200"
          r="180"
          fill="none"
          stroke="url(#ring1)"
          strokeWidth="1.2"
          strokeDasharray="4 8"
          animate={{ rotate: 360 }}
          transition={{ duration: 40, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "200px 200px" }}
        />
        {/* Mid ring */}
        <motion.circle
          cx="200"
          cy="200"
          r="150"
          fill="none"
          stroke="url(#ring2)"
          strokeWidth="0.8"
          strokeDasharray="2 12"
          animate={{ rotate: -360 }}
          transition={{ duration: 55, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "200px 200px" }}
        />
        {/* Inner ring */}
        <motion.circle
          cx="200"
          cy="200"
          r="122"
          fill="none"
          stroke="rgba(148,163,184,0.15)"
          strokeWidth="0.6"
          animate={{ rotate: 360 }}
          transition={{ duration: 80, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "200px 200px" }}
        />

        {/* Orbiting dots (compliance events) */}
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "200px 200px" }}
        >
          <circle cx="200" cy="20" r="4" fill="#10b981" />
          <circle cx="200" cy="20" r="8" fill="#10b981" opacity="0.3" />
        </motion.g>
        <motion.g
          animate={{ rotate: -360 }}
          transition={{ duration: 24, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "200px 200px" }}
        >
          <circle cx="200" cy="50" r="3" fill="#3b82f6" />
        </motion.g>
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "200px 200px" }}
        >
          <circle cx="200" cy="78" r="2.5" fill="#f59e0b" />
        </motion.g>

        {/* Shield body */}
        <motion.g
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          style={{ transformOrigin: "200px 200px" }}
        >
          <path
            d="M200 90
               C 230 100, 260 104, 285 100
               L 285 200
               C 285 255, 250 295, 200 315
               C 150 295, 115 255, 115 200
               L 115 100
               C 140 104, 170 100, 200 90 Z"
            fill="url(#shieldFill)"
            stroke="url(#shieldStroke)"
            strokeWidth="2.2"
          />
          {/* Inner glass panel */}
          <path
            d="M200 118
               C 222 125, 245 128, 263 125
               L 263 198
               C 263 242, 236 274, 200 290
               C 164 274, 137 242, 137 198
               L 137 125
               C 155 128, 178 125, 200 118 Z"
            fill="rgba(255,255,255,0.04)"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
        </motion.g>

        {/* Shimmer sweep */}
        <motion.rect
          x="80"
          y="80"
          width="60"
          height="240"
          fill="url(#sweep)"
          style={{
            mixBlendMode: "overlay",
            transformOrigin: "center",
          }}
          animate={{ x: [80, 300, 80] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
          clipPath='path("M200 90 C 230 100, 260 104, 285 100 L 285 200 C 285 255, 250 295, 200 315 C 150 295, 115 255, 115 200 L 115 100 C 140 104, 170 100, 200 90 Z")'
        />
      </motion.svg>

      {/* Central lucide icon — crisp vector over the SVG mesh */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.3, duration: 0.6 }}
      >
        <div className="relative">
          <div
            className="absolute inset-0 rounded-full blur-2xl"
            style={{ background: "rgba(16,185,129,0.35)" }}
          />
          <ShieldCheck
            size={64}
            strokeWidth={1.6}
            className="relative text-white drop-shadow-[0_0_18px_rgba(16,185,129,0.8)]"
          />
        </div>
      </motion.div>

      {/* Small label pill below the shield */}
      <motion.div
        initial={{ y: 10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="absolute left-1/2 -bottom-2 -translate-x-1/2 flex items-center gap-2 px-3 py-1.5 rounded-full glass text-[11px] text-slate-300 font-medium whitespace-nowrap"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
        Section 43B(h) shield active
      </motion.div>
    </div>
  );
}

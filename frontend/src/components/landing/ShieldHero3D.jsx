import { motion } from "framer-motion";

/**
 * AuroraHero — round 5 visual reset.
 *
 * The previous SVG was busy and emerald-themed; this version is a
 * single, calm composition: a giant typographic "43" surrounded by
 * a pulsing aurora ring, two slow-orbiting planet dots, and a few
 * grain-like floating particles. Pure SVG + framer-motion.
 *
 * Filename kept as ShieldHero3D so the lazy import in Landing.jsx
 * keeps resolving without churn.
 */
export default function ShieldHero3D() {
  return (
    <div className="relative w-full aspect-square max-w-[560px] mx-auto">
      {/* Outer aurora glow */}
      <motion.div
        className="absolute inset-0 rounded-full"
        style={{
          background:
            "radial-gradient(circle at 50% 50%, rgba(167,139,250,0.45) 0%, rgba(232,121,249,0.18) 40%, transparent 70%)",
          filter: "blur(60px)",
        }}
        animate={{ scale: [1, 1.08, 1], opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Concentric rings */}
      <motion.svg
        viewBox="0 0 400 400"
        className="absolute inset-0 w-full h-full"
        aria-hidden
      >
        <defs>
          <linearGradient id="ringGradA" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#a78bfa" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#e879f9" stopOpacity="0.3" />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="ringGradB" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#fbbf24" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#e879f9" stopOpacity="0.0" />
          </linearGradient>
          <radialGradient id="centerHalo" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.18)" />
            <stop offset="55%" stopColor="rgba(167,139,250,0.18)" />
            <stop offset="100%" stopColor="rgba(6,7,15,0)" />
          </radialGradient>
        </defs>

        {/* Soft inner halo */}
        <circle cx="200" cy="200" r="140" fill="url(#centerHalo)" />

        {/* Ring 1 (outer dashed) */}
        <motion.circle
          cx="200"
          cy="200"
          r="190"
          fill="none"
          stroke="url(#ringGradA)"
          strokeWidth="1"
          strokeDasharray="2 10"
          animate={{ rotate: 360 }}
          transition={{ duration: 60, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "200px 200px" }}
        />
        {/* Ring 2 (mid solid faint) */}
        <motion.circle
          cx="200"
          cy="200"
          r="158"
          fill="none"
          stroke="rgba(232, 121, 249, 0.18)"
          strokeWidth="0.6"
          animate={{ rotate: -360 }}
          transition={{ duration: 90, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "200px 200px" }}
        />
        {/* Ring 3 (inner dashed gold) */}
        <motion.circle
          cx="200"
          cy="200"
          r="128"
          fill="none"
          stroke="url(#ringGradB)"
          strokeWidth="0.8"
          strokeDasharray="1 6"
          animate={{ rotate: 360 }}
          transition={{ duration: 45, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "200px 200px" }}
        />

        {/* Orbiting planet dots */}
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "200px 200px" }}
        >
          <circle cx="200" cy="10" r="5" fill="#a78bfa" />
          <circle cx="200" cy="10" r="11" fill="#a78bfa" opacity="0.25" />
        </motion.g>
        <motion.g
          animate={{ rotate: -360 }}
          transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "200px 200px" }}
        >
          <circle cx="200" cy="42" r="3.5" fill="#e879f9" />
          <circle cx="200" cy="42" r="8" fill="#e879f9" opacity="0.25" />
        </motion.g>
        <motion.g
          animate={{ rotate: 360 }}
          transition={{ duration: 38, repeat: Infinity, ease: "linear" }}
          style={{ transformOrigin: "200px 200px" }}
        >
          <circle cx="200" cy="72" r="2.5" fill="#fbbf24" />
        </motion.g>
      </motion.svg>

      {/* Center display: typographic "43B(h)" mark */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="relative text-center">
          <div
            className="absolute inset-0 -m-10 rounded-full blur-3xl"
            style={{ background: "rgba(167, 139, 250, 0.5)" }}
          />
          <p className="relative aurora-headline text-[120px] md:text-[160px] leading-none text-white">
            43<span className="text-[#fbbf24]">B</span>
            <span className="text-[#e879f9]">(h)</span>
          </p>
          <p className="relative mt-2 font-mono text-[10px] tracking-[0.4em] uppercase text-violet-300/80">
            Compliance · Active
          </p>
        </div>
      </motion.div>

      {/* Bottom status pill */}
      <motion.div
        initial={{ y: 12, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.5 }}
        className="absolute left-1/2 -bottom-1 -translate-x-1/2"
      >
        <span className="chip">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] pulse-dot" />
          Section 43B(h) shield active
        </span>
      </motion.div>
    </div>
  );
}

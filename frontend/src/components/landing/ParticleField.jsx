import { useEffect, useRef } from "react";

/**
 * A lightweight canvas particle field used as a hero background layer.
 * Renders at ~60fps with ~60 softly drifting slate dots plus occasional
 * emerald/rose accent particles. No dependencies, no React state, and
 * cheap enough to run above the fold on a CFO's laptop.
 *
 * Props:
 *   density   — number, default 60. Particle count.
 *   className — applied to the wrapping <div> so callers can position it.
 */
export default function ParticleField({ density = 60, className = "" }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const particlesRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const accentColors = [
      "rgba(16, 185, 129, 0.55)", // emerald
      "rgba(59, 130, 246, 0.55)", // blue
      "rgba(244, 63, 94, 0.45)",  // rose
    ];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const { width, height } = canvas.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    };

    const initParticles = () => {
      const { width, height } = canvas.getBoundingClientRect();
      const particles = [];
      for (let i = 0; i < density; i++) {
        const accent = Math.random() < 0.12;
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.12,
          vy: (Math.random() - 0.5) * 0.12,
          r: Math.random() * 1.8 + 0.4,
          alpha: Math.random() * 0.5 + 0.2,
          color: accent
            ? accentColors[Math.floor(Math.random() * accentColors.length)]
            : "rgba(148, 163, 184, 0.4)",
        });
      }
      particlesRef.current = particles;
    };

    const tick = () => {
      const { width, height } = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, width, height);
      const ps = particlesRef.current;
      for (const p of ps) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < -5) p.x = width + 5;
        if (p.x > width + 5) p.x = -5;
        if (p.y < -5) p.y = height + 5;
        if (p.y > height + 5) p.y = -5;
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(tick);
    };

    resize();
    initParticles();
    rafRef.current = requestAnimationFrame(tick);
    const handleResize = () => {
      resize();
      initParticles();
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, [density]);

  return (
    <div className={`pointer-events-none absolute inset-0 ${className}`}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

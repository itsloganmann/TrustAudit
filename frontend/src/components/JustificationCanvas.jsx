import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Html, OrbitControls } from "@react-three/drei";
import * as THREE from "three";
import { cn } from "../lib/cn";

/* ─────────────────────────────────────────────
   JustificationCanvas — 3D visualization of an
   invoice's tax recommendation.

   Center: confidence sphere (rose → amber → emerald)
   Orbit:  available fields (emerald) + missing fields (rose ghost)
   Right:  deductible value bar
   Bottom: rotating recommendation ribbon
   ───────────────────────────────────────────── */

const ROSE = new THREE.Color("#f43f5e");
const AMBER = new THREE.Color("#f59e0b");
const EMERALD = new THREE.Color("#10b981");

function confidenceColor(confidence) {
  const c = Math.max(0, Math.min(1, Number(confidence) || 0));
  if (c <= 0.55) {
    const t = c / 0.55;
    return new THREE.Color().lerpColors(ROSE, AMBER, t);
  }
  if (c <= 0.85) {
    const t = (c - 0.55) / 0.3;
    return new THREE.Color().lerpColors(AMBER, EMERALD, t);
  }
  return EMERALD.clone();
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const handle = () => setReduced(mq.matches);
    handle();
    if (mq.addEventListener) {
      mq.addEventListener("change", handle);
      return () => mq.removeEventListener("change", handle);
    }
    mq.addListener(handle);
    return () => mq.removeListener(handle);
  }, []);
  return reduced;
}

function formatInr(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n === 0) return "INR 0";
  return `INR ${n.toLocaleString("en-IN")}`;
}

/* ── Central confidence sphere ── */
function CenterSphere({ confidence, reducedMotion }) {
  const meshRef = useRef(null);
  const color = useMemo(() => confidenceColor(confidence), [confidence]);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    if (reducedMotion) {
      meshRef.current.scale.setScalar(1);
      return;
    }
    const t = clock.getElapsedTime();
    const pulse = 1 + Math.sin(t * 1.8) * 0.04;
    meshRef.current.scale.setScalar(pulse);
  });

  return (
    <group>
      <mesh ref={meshRef}>
        <sphereGeometry args={[1, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.45}
          roughness={0.35}
          metalness={0.15}
        />
      </mesh>
      <Html center distanceFactor={8} style={{ pointerEvents: "none" }}>
        <div className="text-center whitespace-nowrap select-none">
          <div className="text-[9px] uppercase tracking-[0.18em] text-slate-400 font-semibold">
            Confidence
          </div>
          <div className="text-[15px] font-bold text-white tabular-nums">
            {Math.round((Number(confidence) || 0) * 100)}%
          </div>
        </div>
      </Html>
    </group>
  );
}

/* ── Available field orbit node ── */
function AvailableFieldNode({ field, index, count }) {
  const angle = (index / Math.max(count, 1)) * Math.PI * 2;
  const radius = 2.2;
  const yJitter = ((index * 37) % 7) / 10 - 0.35;
  const position = [
    Math.cos(angle) * radius,
    yJitter,
    Math.sin(angle) * radius,
  ];
  const conf = Number(field?.confidence) || 0.9;
  const color = useMemo(() => confidenceColor(Math.max(conf, 0.85)), [conf]);

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.28, 24, 24]} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0.6}
          roughness={0.4}
        />
      </mesh>
      <Html
        center
        distanceFactor={9}
        style={{ pointerEvents: "none" }}
        position={[0, 0.55, 0]}
      >
        <div className="text-[9px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-md px-1.5 py-0.5 whitespace-nowrap select-none">
          {field?.label || field?.field_name || "field"}
        </div>
      </Html>
    </group>
  );
}

/* ── Missing field ghost node ── */
function MissingFieldNode({ field, index, count, reducedMotion }) {
  const safeCount = Math.max(count, 1);
  const angle = (index / safeCount) * Math.PI * 2 + Math.PI / safeCount;
  const radius = 2.2;
  const yJitter = ((index * 53) % 7) / 10 - 0.3;
  const position = [
    Math.cos(angle) * radius,
    yJitter + 0.3,
    Math.sin(angle) * radius,
  ];
  const materialRef = useRef(null);

  useFrame(({ clock }) => {
    if (!materialRef.current) return;
    if (reducedMotion) {
      materialRef.current.opacity = 0.55;
      return;
    }
    const t = clock.getElapsedTime();
    materialRef.current.opacity = 0.35 + (Math.sin(t * 2.2 + index) + 1) * 0.22;
  });

  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.28, 20, 20]} />
        <meshStandardMaterial
          ref={materialRef}
          color={ROSE}
          emissive={ROSE}
          emissiveIntensity={0.6}
          wireframe
          transparent
          opacity={0.55}
        />
      </mesh>
      <Html
        center
        distanceFactor={9}
        style={{ pointerEvents: "none" }}
        position={[0, 0.55, 0]}
      >
        <div className="text-[9px] font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-md px-1.5 py-0.5 whitespace-nowrap select-none">
          <span>{field?.label || field?.field_name || "missing"}</span>
          {Number.isFinite(Number(field?.impact_inr)) && Number(field?.impact_inr) !== 0 ? (
            <span className="ml-1 text-rose-200">
              {formatInr(field.impact_inr)}
            </span>
          ) : null}
        </div>
      </Html>
    </group>
  );
}

/* ── Deduction bar on the right side ── */
function DeductionBar({ deductionInr, maxInr }) {
  const safeMax = Math.max(Number(maxInr) || 0, Number(deductionInr) || 0, 1);
  const ratio = Math.max(0, Math.min(1, (Number(deductionInr) || 0) / safeMax));
  const height = Math.max(0.15, ratio * 3.6);
  const y = height / 2 - 1.4;

  return (
    <group position={[3.4, 0, 0]}>
      {/* Hollow track */}
      <mesh position={[0, 0.4, 0]}>
        <boxGeometry args={[0.45, 3.8, 0.45]} />
        <meshStandardMaterial
          color="#0f172a"
          transparent
          opacity={0.35}
          roughness={0.9}
        />
      </mesh>
      {/* Fill */}
      <mesh position={[0, y, 0]}>
        <boxGeometry args={[0.42, height, 0.42]} />
        <meshStandardMaterial
          color={EMERALD}
          emissive={EMERALD}
          emissiveIntensity={0.5}
          roughness={0.3}
        />
      </mesh>
      <Html
        center
        distanceFactor={9}
        position={[0, 2.6, 0]}
        style={{ pointerEvents: "none" }}
      >
        <div className="text-center whitespace-nowrap select-none">
          <div className="text-[12px] font-bold text-emerald-300 tabular-nums">
            {formatInr(deductionInr)}
          </div>
          <div className="text-[8px] uppercase tracking-[0.18em] text-slate-400 font-semibold mt-0.5">
            deductible under 43B(h)
          </div>
        </div>
      </Html>
    </group>
  );
}

/* ── Recommendation ribbon at the bottom ── */
function RecommendationRibbon({ recommendations, reducedMotion }) {
  const [tick, setTick] = useState(0);
  const count = recommendations?.length || 0;

  useEffect(() => {
    if (count <= 1) return undefined;
    if (reducedMotion) return undefined;
    const timer = setInterval(() => {
      setTick((t) => t + 1);
    }, 4000);
    return () => clearInterval(timer);
  }, [count, reducedMotion]);

  // Derive index from tick + count so we never need to clamp via setState.
  const index = count > 0 ? tick % count : 0;
  const current = count > 0 ? recommendations[index] : null;
  const severity = current?.severity || "info";
  const severityClass =
    severity === "critical"
      ? "bg-rose-500/10 border-rose-500/30 text-rose-200"
      : severity === "warning"
      ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
      : "bg-emerald-500/10 border-emerald-500/30 text-emerald-200";

  return (
    <group position={[0, -2.2, 0]} rotation={[-0.22, 0, 0]}>
      <mesh>
        <planeGeometry args={[6.2, 0.9, 32, 1]} />
        <meshStandardMaterial
          color="#0b1220"
          transparent
          opacity={0.55}
          roughness={0.95}
          side={THREE.DoubleSide}
        />
      </mesh>
      <Html
        center
        distanceFactor={8}
        style={{ pointerEvents: "none" }}
      >
        <div
          className={cn(
            "px-3 py-1.5 rounded-lg border whitespace-nowrap select-none text-center min-w-[220px]",
            severityClass
          )}
        >
          {current ? (
            <>
              <div className="text-[11px] font-semibold tracking-tight">
                {current.title}
              </div>
              {Number.isFinite(Number(current.amount_inr)) && Number(current.amount_inr) !== 0 ? (
                <div className="text-[9px] font-medium tabular-nums mt-0.5 opacity-90">
                  {formatInr(current.amount_inr)}
                </div>
              ) : null}
            </>
          ) : (
            <div className="text-[11px] font-semibold tracking-tight text-slate-400">
              No recommendations available
            </div>
          )}
        </div>
      </Html>
    </group>
  );
}

/* ── Scene wrapper ── */
function Scene({
  confidence,
  deductionInr,
  totalRecoverableInr,
  availableFields,
  missingFields,
  recommendations,
  reducedMotion,
}) {
  const safeAvailable = Array.isArray(availableFields) ? availableFields : [];
  const safeMissing = Array.isArray(missingFields) ? missingFields : [];
  const safeRecommendations = Array.isArray(recommendations) ? recommendations : [];

  return (
    <>
      <ambientLight intensity={0.55} />
      <pointLight position={[6, 6, 6]} intensity={1.2} color="#f8fafc" />
      <pointLight position={[-6, -2, -4]} intensity={0.6} color="#38bdf8" />

      <CenterSphere confidence={confidence} reducedMotion={reducedMotion} />

      {safeAvailable.map((field, i) => (
        <AvailableFieldNode
          key={`av-${field?.field_name || i}`}
          field={field}
          index={i}
          count={safeAvailable.length}
        />
      ))}

      {safeMissing.map((field, i) => (
        <MissingFieldNode
          key={`mi-${field?.field_name || i}`}
          field={field}
          index={i}
          count={safeMissing.length}
          reducedMotion={reducedMotion}
        />
      ))}

      <DeductionBar
        deductionInr={deductionInr}
        maxInr={Math.max(Number(totalRecoverableInr) || 0, Number(deductionInr) || 0)}
      />

      <RecommendationRibbon
        recommendations={safeRecommendations}
        reducedMotion={reducedMotion}
      />

      <OrbitControls
        enableZoom={false}
        enablePan={false}
        autoRotate={false}
        makeDefault
      />
    </>
  );
}

/* ── WebGL fallback ── */
function Fallback({ confidence, deductionInr, totalRecoverableInr, missingFields }) {
  return (
    <div className="w-full h-[360px] rounded-xl border border-white/[0.06] bg-slate-900/50 flex flex-col items-center justify-center text-center p-6">
      <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 font-semibold">
        Justification snapshot
      </div>
      <div className="mt-2 text-[24px] font-bold text-white tabular-nums">
        {Math.round((Number(confidence) || 0) * 100)}%
      </div>
      <div className="mt-1 text-[11px] text-slate-400">
        confidence · {formatInr(deductionInr)} deductible
      </div>
      {Number(totalRecoverableInr) > 0 && (
        <div className="text-[10px] text-emerald-300 mt-1">
          {formatInr(totalRecoverableInr)} recoverable
        </div>
      )}
      {Array.isArray(missingFields) && missingFields.length > 0 && (
        <div className="text-[10px] text-rose-300 mt-2">
          {missingFields.length} missing field{missingFields.length === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
}

export default function JustificationCanvas({
  invoiceId,
  confidence = 0,
  deductionInr = 0,
  totalRecoverableInr = 0,
  availableFields = [],
  missingFields = [],
  recommendations = [],
  className,
}) {
  const reducedMotion = usePrefersReducedMotion();
  // WebGL detection runs once via lazy initial state — safe in CSR (this
  // module is lazy-loaded so SSR never reaches it). If detection fails or
  // window is missing we default to true and let three.js raise its own
  // error rather than blocking the render.
  const [hasWebGL] = useState(() => {
    if (typeof window === "undefined" || typeof document === "undefined") {
      return true;
    }
    try {
      const canvas = document.createElement("canvas");
      const gl =
        canvas.getContext("webgl2") ||
        canvas.getContext("webgl") ||
        canvas.getContext("experimental-webgl");
      return Boolean(gl);
    } catch {
      return false;
    }
  });

  if (!hasWebGL) {
    return (
      <div className={cn("w-full", className)} data-invoice-id={invoiceId}>
        <Fallback
          confidence={confidence}
          deductionInr={deductionInr}
          totalRecoverableInr={totalRecoverableInr}
          missingFields={missingFields}
        />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "w-full h-[360px] rounded-xl border border-white/[0.06] bg-gradient-to-b from-slate-900/70 to-slate-950/80 overflow-hidden relative",
        className
      )}
      data-invoice-id={invoiceId}
    >
      <Canvas
        dpr={[1, 1.25]}
        gl={{ antialias: true, alpha: true, powerPreference: "low-power" }}
        camera={{ position: [4, 3, 6], fov: 45, near: 0.1, far: 100 }}
        performance={{ min: 0.5 }}
        onCreated={({ gl }) => {
          gl.setClearColor(new THREE.Color("#020617"), 0);
        }}
      >
        <Suspense fallback={null}>
          <Scene
            confidence={confidence}
            deductionInr={deductionInr}
            totalRecoverableInr={totalRecoverableInr}
            availableFields={availableFields}
            missingFields={missingFields}
            recommendations={recommendations}
            reducedMotion={reducedMotion}
          />
        </Suspense>
      </Canvas>

      {/* Top-left badge */}
      <div className="absolute top-3 left-3 flex items-center gap-2 bg-slate-950/60 backdrop-blur-md border border-white/[0.08] rounded-md px-2 py-1 pointer-events-none">
        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
        <span className="text-[9px] uppercase tracking-[0.18em] text-slate-300 font-semibold">
          Justification · 3D
        </span>
      </div>
    </div>
  );
}

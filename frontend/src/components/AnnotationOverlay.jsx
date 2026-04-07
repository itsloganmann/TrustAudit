import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ScanSearch, ImageOff } from "lucide-react";

/* ─────────────────────────────────────────────
   AnnotationOverlay — fetches the Pillow-rendered
   challan PNG plus bounding boxes, then overlays
   animated SVG affordances (fade-in, hover tooltip).
   ───────────────────────────────────────────── */

const CARD_SHELL = {
  position: "relative",
  borderRadius: "14px",
  padding: "1px",
  background:
    "linear-gradient(135deg, rgba(16,185,129,0.45) 0%, rgba(59,130,246,0.25) 40%, rgba(236,72,153,0.35) 100%)",
  backgroundSize: "200% 200%",
  animation: "annotationShimmer 6s ease-in-out infinite",
};

const CARD_INNER = {
  borderRadius: "13px",
  background: "rgba(10, 15, 26, 0.92)",
  overflow: "hidden",
};

export default function AnnotationOverlay({ invoiceId }) {
  const [result, setResult] = useState({ id: null, data: null, error: null });
  const [hoveredIdx, setHoveredIdx] = useState(null);

  useEffect(() => {
    if (invoiceId == null) return;
    let cancelled = false;

    const load = async () => {
      try {
        const res = await fetch(`/api/invoices/${invoiceId}/annotation`, {
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (cancelled) return;
        setResult({ id: invoiceId, data: json, error: null });
      } catch (err) {
        if (cancelled) return;
        setResult({
          id: invoiceId,
          data: null,
          error: err?.message || "Failed to load annotation",
        });
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [invoiceId]);

  // Reset hover when invoice id transitions
  useEffect(() => {
    setHoveredIdx(null);
  }, [invoiceId]);

  // Derive loading state: either we never loaded, or the loaded id lags current prop
  const isCurrent = result.id === invoiceId;
  const loading = !isCurrent;
  const error = isCurrent ? result.error : null;
  const data = isCurrent ? result.data : null;

  return (
    <>
      <style>{shimmerKeyframes}</style>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-white/[0.05] border border-white/[0.08] flex items-center justify-center">
            <ScanSearch size={12} className="text-slate-400" />
          </div>
          <p className="text-[12px] text-white font-semibold tracking-tight">
            Vision Annotation Preview
          </p>
          {data?.boxes?.length ? (
            <span className="ml-auto text-[9px] font-mono uppercase tracking-widest text-emerald-400/80">
              {data.boxes.length} regions detected
            </span>
          ) : null}
        </div>

        <div style={CARD_SHELL}>
          <div style={CARD_INNER}>
            {loading && <SkeletonTile />}
            {!loading && error && <EmptyTile label="Annotation unavailable" detail={error} />}
            {!loading && !error && (!data?.image || data.image === "") && (
              <EmptyTile label="No annotation available" />
            )}
            {!loading && !error && data?.image && (
              <AnnotatedFigure
                data={data}
                hoveredIdx={hoveredIdx}
                onHover={setHoveredIdx}
              />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function AnnotatedFigure({ data, hoveredIdx, onHover }) {
  const { image, width, height, boxes } = data;
  const safeWidth = width || 800;
  const safeHeight = height || 1200;
  const boxList = Array.isArray(boxes) ? boxes : [];
  const hoveredBox = hoveredIdx != null ? boxList[hoveredIdx] : null;

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        aspectRatio: `${safeWidth} / ${safeHeight}`,
      }}
    >
      <img
        src={image}
        alt="Annotated challan preview"
        draggable={false}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "contain",
          userSelect: "none",
        }}
      />
      <svg
        viewBox={`0 0 ${safeWidth} ${safeHeight}`}
        preserveAspectRatio="xMidYMid meet"
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      >
        {boxList.map((box, idx) => {
          const color = box.color || "#10b981";
          const x = box.x ?? 0;
          const y = box.y ?? 0;
          const w = box.w ?? 0;
          const h = box.h ?? 0;
          const labelText = `${box.field_name || "field"}: ${Math.round(
            (box.confidence ?? 0) * 100,
          )}%`;
          const labelY = Math.max(20, y - 10);
          const isHover = hoveredIdx === idx;
          const transformOrigin = `${x + w / 2}px ${y + h / 2}px`;

          return (
            <g key={`${box.field_name}-${idx}`}>
              <motion.rect
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 0.9, scale: 1 }}
                transition={{
                  delay: idx * 0.08,
                  duration: 0.45,
                  ease: [0.16, 1, 0.3, 1],
                }}
                style={{
                  transformOrigin,
                  transformBox: "fill-box",
                  pointerEvents: "all",
                  cursor: "pointer",
                }}
                x={x}
                y={y}
                width={w}
                height={h}
                fill={color}
                fillOpacity={0.5}
                stroke={color}
                strokeOpacity={0.5}
                strokeWidth={isHover ? 6 : 3}
                rx={8}
                ry={8}
                onMouseEnter={() => onHover(idx)}
                onMouseLeave={() => onHover(null)}
              />
              <motion.text
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.08 + 0.18, duration: 0.3 }}
                x={x + 6}
                y={labelY}
                fontSize={22}
                fontWeight={700}
                fill="#ffffff"
                stroke={color}
                strokeWidth={0.8}
                paintOrder="stroke"
                style={{
                  fontFamily: "ui-sans-serif, system-ui, sans-serif",
                  pointerEvents: "none",
                }}
              >
                {labelText}
              </motion.text>
            </g>
          );
        })}
      </svg>

      <AnimatePresence>
        {hoveredBox && (
          <motion.div
            key={`tooltip-${hoveredIdx}`}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.18 }}
            style={{
              position: "absolute",
              left: "50%",
              bottom: 12,
              transform: "translateX(-50%)",
              pointerEvents: "none",
              maxWidth: "85%",
            }}
          >
            <div
              className="rounded-lg px-3 py-2 border border-white/[0.08] shadow-2xl"
              style={{
                background: "rgba(10, 15, 26, 0.92)",
                backdropFilter: "blur(8px)",
              }}
            >
              <div className="flex items-center gap-2">
                <span
                  className="inline-block w-2 h-2 rounded-full"
                  style={{ background: hoveredBox.color || "#10b981" }}
                />
                <span className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">
                  {hoveredBox.field_name}
                </span>
                <span className="ml-auto text-[10px] font-mono text-emerald-400">
                  {Math.round((hoveredBox.confidence ?? 0) * 100)}%
                </span>
              </div>
              <p className="text-[12px] text-white font-medium mt-1 break-words">
                {hoveredBox.missing ? (
                  <span className="text-rose-400">— missing —</span>
                ) : (
                  hoveredBox.value || "(empty)"
                )}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SkeletonTile() {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "2 / 3",
        background:
          "linear-gradient(100deg, rgba(255,255,255,0.02) 30%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.02) 70%)",
        backgroundSize: "200% 100%",
        animation: "annotationShimmer 1.8s linear infinite",
      }}
      className="flex flex-col items-center justify-center gap-2"
    >
      <div className="w-8 h-8 rounded-full border-2 border-emerald-500/30 border-t-emerald-400 animate-spin" />
      <p className="text-[10px] uppercase tracking-widest text-slate-500 font-semibold">
        Rendering annotation…
      </p>
    </div>
  );
}

function EmptyTile({ label, detail }) {
  return (
    <div
      style={{
        width: "100%",
        aspectRatio: "2 / 3",
        background: "rgba(10, 15, 26, 0.4)",
      }}
      className="flex flex-col items-center justify-center gap-2 text-center px-4"
    >
      <ImageOff size={24} className="text-slate-600" />
      <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">
        {label}
      </p>
      {detail && <p className="text-[10px] text-slate-600">{detail}</p>}
    </div>
  );
}

const shimmerKeyframes = `
@keyframes annotationShimmer {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
`;

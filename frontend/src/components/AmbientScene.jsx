import { useEffect, useRef } from "react";

/**
 * AmbientScene — pure WebGL backdrop, no libraries.
 *
 * Renders a fullscreen quad with a fragment shader that:
 *   - Produces sine-wave "liquid" deformations driven by time
 *   - Radial-gradients from slate-950 at edges to a deep emerald near center
 *   - Stays subtle (amplitude ~0.15 equivalent) to sit behind content
 *
 * Avoids three.js entirely to keep the bundle delta tiny (~2KB gzip).
 * Caller (AmbientBackground) handles prefers-reduced-motion fallback.
 */
const VERT = `
  attribute vec2 a_pos;
  varying vec2 v_uv;
  void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const FRAG = `
  precision mediump float;
  uniform float u_time;
  uniform vec2 u_res;
  varying vec2 v_uv;

  // Domain-warping liquid field. Cheap: 3 sine calls, 1 length.
  void main() {
    vec2 uv = v_uv;
    vec2 centered = uv - 0.5;
    centered.x *= u_res.x / u_res.y;

    float t = u_time * 0.35;

    // Three overlapping waves create a rolling-liquid feel
    float w1 = sin(centered.x * 3.5 + t) * 0.15;
    float w2 = sin(centered.y * 2.8 - t * 0.8) * 0.12;
    float w3 = sin((centered.x + centered.y) * 2.2 + t * 0.6) * 0.09;
    float field = w1 + w2 + w3;

    float d = length(centered) + field * 0.35;
    float falloff = smoothstep(0.05, 0.75, d);

    // Edge colour (slate-950) and center tint (deep emerald)
    vec3 edge   = vec3(0.008, 0.023, 0.090);
    vec3 center = vec3(0.024, 0.118, 0.082);

    vec3 col = mix(center, edge, falloff);

    // Subtle ambient lift from the wave field (keeps it alive)
    col += vec3(0.018, 0.042, 0.032) * (field * 2.0);

    // Very faint vignette so edges fade even further
    float vig = smoothstep(1.1, 0.3, length(centered));
    col *= 0.85 + 0.15 * vig;

    gl_FragColor = vec4(col, 1.0);
  }
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return sh;
}

function createProgram(gl) {
  const prog = gl.createProgram();
  const vs = compile(gl, gl.VERTEX_SHADER, VERT);
  const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(prog);
    throw new Error(`Program link failed: ${log}`);
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return prog;
}

export default function AmbientScene() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl =
      canvas.getContext("webgl", { antialias: false, alpha: false, powerPreference: "low-power" }) ||
      canvas.getContext("experimental-webgl");

    if (!gl) {
      // WebGL unsupported — fall back silently; static CSS bg still shows
      return;
    }

    let program;
    try {
      program = createProgram(gl);
    } catch (err) {
      console.warn("AmbientScene: shader init failed, falling back to static bg", err);
      return;
    }

    gl.useProgram(program);

    // Fullscreen quad (two triangles)
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
      gl.STATIC_DRAW
    );
    const aPos = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(aPos);
    gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

    const uTime = gl.getUniformLocation(program, "u_time");
    const uRes = gl.getUniformLocation(program, "u_res");

    const resize = () => {
      // Cap DPR at 1.25 — this runs behind content, extra pixels are wasted
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      const w = Math.floor(window.innerWidth * dpr);
      const h = Math.floor(window.innerHeight * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      gl.viewport(0, 0, w, h);
      gl.uniform2f(uRes, w, h);
    };
    resize();
    window.addEventListener("resize", resize);

    // Throttle to ~30 fps to stay GPU-cheap (we cap render rate manually)
    const FRAME_MS = 1000 / 30;
    let running = true;
    let rafId = 0;
    let last = performance.now();
    const start = last;

    const tick = (now) => {
      if (!running) return;
      rafId = requestAnimationFrame(tick);
      if (now - last < FRAME_MS) return;
      last = now;
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    };
    rafId = requestAnimationFrame(tick);

    // Pause when tab hidden to save battery
    const handleVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(rafId);
      } else if (!running) {
        running = true;
        last = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", handleVisibility);
      gl.deleteBuffer(buf);
      gl.deleteProgram(program);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        display: "block",
      }}
    />
  );
}

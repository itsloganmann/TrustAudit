# Adversary Review — Round 3 Worker Fleet

Reviewer: A1 (adversary)
Started: 2026-04-06
Repo: TrustAudit (Section 43B(h) compliance demo)

## Verdict Table

| W | Branch | Verdict | Issues | Sha |
|---|--------|---------|--------|-----|
| W1 | feat/phase-i-sse-backend | **FAIL** | (1) PII leak: emit() ships unanonymized vendor_name+GSTIN to public unauth SSE; (2) wildcard `session=*` is publicly subscribable; (3) `put_nowait` cross-thread race | 5b8cdc2 |
| W2 | feat/phase-k-smoke-1114 | PASS_WITH_NOTES | does not test SSE wildcard / PII leak; otherwise pure additive | 90f01fe |
| W3 | feat/phase-l-gemini-guard | PASS | none | 1d355c0 |
| W4 | feat/phase-i-sse-frontend | PASS_WITH_NOTES | depends on W1 SSE backend (must merge after); JSX provider wraps non-block child | ad9b63b |
| W5 | feat/phase-j-3d-canvas | PASS_WITH_NOTES | shares InvoiceDetailSheet edits with W6 — merge with care | edcc71d |
| W6 | feat/phase-h2-annotation-overlay | PASS_WITH_NOTES | trusts /annotation JSON for color/value rendering (not blocking — same trust boundary as drawer) | 697de88 |
| W7 | feat/phase-n-liquid-glass | PASS | none | 0f31d8b |
| W8 | feat/phase-n-motion-pass | PASS_WITH_NOTES | merged W7 in already; touches InvoiceDetailSheet — merge after W5+W6; relies on W5's null-invoice handling | 2491277 |
| W9 | feat/phase-n-about-polish | PASS | none | f1c4045 |
| W10 | feat/phase-m-e2e-runner (renamed from -visual-verify) | PASS_WITH_NOTES | did not add a /live SSE PII test (would have caught W1) | bb1b1c4 |

## Detailed Findings

### W3 — feat/phase-l-gemini-guard @ 1d355c0 — PASS

Diff: 3 files / +304 / -5. Pure backend hardening.

- `vision/__init__.py` — factory now treats whitespace-only `VISION_PROVIDER` and `name` arg as unset; falls through to mock instead of the `unknown provider` branch. Correct.
- `vision/gemini_client.py` — `GEMINI_API_KEY` and `GEMINI_MODEL` are stripped; whitespace-only key now raises `VisionProviderNotConfigured` (which `get_vision_provider` catches and downgrades to mock). Also widens the `extract` exception net to `TypeError, AttributeError` and rejects non-dict JSON payloads — graceful degradation, no swallowed errors.
- `tests/test_vision_factory.py` — 270 LoC of regression tests covering all the above plus the preprocessed-SHA paired-expected lookup bug from earlier rounds. Good coverage discipline.

Security: no new attack surface; the change is strict, not lax. Backward compat: existing tests should still pass — the factory still emits the same provider types, schemas unchanged. No new deps. PEP 8 / type hints clean.

**Verdict: safe to merge as-is.**

### W9 — feat/phase-n-about-polish @ f1c4045 — PASS

Diff: 3 files / +489 / -22.

- `public/team/{logan,arnav}.svg` — bundled stylized founder avatars (no inline scripts, no foreignObject).
- `pages/About.jsx` — adds a Why-stats section, a Timeline component, a contact links block, and a fallback chain for the founder photos (jpg → svg → initials, owned via React state instead of DOM mutation — improvement over main).

Security:
- No new API endpoints, no auth surface.
- All external `<a target="_blank">` links use `rel="noopener noreferrer"`. Email links use `mailto:`.
- Avatar SVGs are static markup with no `<script>` or `<foreignObject>` — safe.
- The new fallback chain replaces the old `e.currentTarget.style.display = "none"` DOM mutation with React state ownership — strictly cleaner.

Backward compat: pure additive marketing copy. No backend, no API contract.

**Verdict: safe to merge as-is.**

### W2 — feat/phase-k-smoke-1114 @ 90f01fe — PASS_WITH_NOTES

Diff: 1 file / +382 / 0. Pure additive on `scripts/smoke/full_pipeline_smoke.sh`. No deletions, so the existing 59-test contract is preserved.

Adds four new sections:

- **Section 11 — Real-internet receipt ingestion**: POSTs three GitHub raw URLs (perfect_tally_printed, digital_rephoto, composition_scheme_no_gstin) into `/api/webhook/whatsapp/inbound` with unique phone numbers per URL+timestamp so the dedup layer doesn't short-circuit. Polls `/api/live/invoices?session=live-phone-<digits>` for up to 30s. Aggregate guarantees: at least one row crosses 0.85 (PASS), or rows appear but below threshold (SKIP — mock penalty), or all dedup'd (SKIP), or none appear (FAIL).
- **Section 12 — Annotation endpoint**: validates `/api/invoices/{id}/annotation` returns a `data:image/png;base64,` URL, width/height > 0, exactly 6 boxes, every box has `field_name/value/confidence/x/y/w/h/color/missing` keys, sample box is well-formed.
- **Section 13 — Justification endpoint**: validates required keys, recommendation count, recommendation shape (`title/rationale/amount_inr/severity`), and dispatches between two happy paths (missing fields → per-field recs, fully verified → "Submit to the government today" rec).
- **Section 14 — SSE live stream**: probes `/api/live/stream`, gracefully skips on 404 / SPA-catch-all / non-event-stream content-type, and on a real stream opens a background curl → POSTs an inbound webhook on a session-bound phone → captures `event: invoice…` lines from the stream. SKIPs cleanly if no event arrives (so the cross-thread W1 race doesn't necessarily blow this up).

Security: bash hygiene is fine — phone numbers are constructed from timestamps, no shell injection vectors. Uses `mktemp -t` consistently. cleans up temp files at the end. Uses single-quoted JQ filters.

Backward compat: the existing 59 tests are untouched. New tests use the same `pass`/`fail`/`skip` helpers and contribute to the same totals.

Notes:
- **Section 14 does not test the wildcard `session=*` PII path** that W1 leaks. A two-line addition (`curl /api/live/stream?session=*` + grep for `vendor_name`/`gstin`) would catch it. Strongly recommend adding before the demo if W1 is shipped to production.
- **Section 11 polls `/api/live/invoices?session=live-phone-<digits>`** which goes through the anonymizing `list_recent()` path — so this section also does not exercise the raw `vendor_name` leak.
- The bash uses `awk -v c="$conf" 'BEGIN{exit !(c+0 >= 0.85)}'` for float comparison — portable across BSD/GNU awk. Good.
- The "section 11 expects 6 annotation boxes exactly" assertion is brittle if `services/justification.py` ever changes the box count. Test is correct for today.

**Verdict: safe to merge as-is. The new sections are gated to skip cleanly if W1 isn't merged or if dedup blocks the rerun, so it won't fail spuriously.**

### W10 — feat/phase-m-e2e-runner @ bb1b1c4 — PASS_WITH_NOTES

Note: this branch was originally listed as `feat/phase-m-visual-verify` in the worker plan; the manager remapped W10 to a Playwright e2e runner. Already merged into main as `7ca0206`.

Diff: 10 files / +1039 / -33. Pure test infrastructure.

- Six POM page objects (`SignInPage`, `VendorDashboardPage`, `InvoiceDrawer`, `PublicLivePage`, `AboutPage`, `VerifyPage`).
- `critical.spec.ts` covering 5 critical journeys: vendor sign-in, invoice drawer, /about cofounders, /live demo, **/verify PII protection**.
- `important.spec.ts` covering SSE toast probe, team photos, compliance PDF auth.
- `playwright.config.ts` retargeted at the Vite dev server (5173) instead of the built bundle on 8000. No `webServer` block — relies on the operator running the stack manually (`pm2 start` etc).
- Optional features (W5/W6/SSE) gated behind `test.fixme()` so the suite stays green when those branches haven't merged yet.

Security:
- The `/verify` PII test (Journey 5) checks for `["Gupta Steel Works", "29ABCDE1234F1Z5"]` in the rendered body — exactly the right pattern. PASS.
- Test code only — no runtime path.

Backward compat: drop-in additions.

Notes (non-blocking):
- **The PII test is on `/verify` only — it does not cover `/api/live/stream?session=*` or `/api/live/invoices?session=*`.** A spec that did `request.get('/api/live/stream?session=*')` and asserted no `vendor_name`/`gstin` would have flagged the W1 issue at e2e time. Worth adding before the demo.
- The Vite-error-overlay short-circuit (`test.fixme(true, "Vite compilation error in app …")`) is pragmatic for a parallel-fleet workflow but masks regressions in production builds. Convert to a hard failure post-demo.
- One typo in the docstring header lists "Unshipped features (W6, W10, SSE)" — W10 is the test runner itself, presumably meant W5 or another.

**Verdict: safe to merge as-is. ALREADY MERGED — flag the missing SSE-PII coverage to the manager so they can add a follow-up spec before the demo.**

### W8 — feat/phase-n-motion-pass @ 2491277 — PASS_WITH_NOTES

Diff: 7 files / +208 / -85 (W8-only diff vs the merged W7 commit). W8 has already merged W7 into its branch — clean superset.

- Imports `useReducedMotion` from framer-motion across `Dashboard`, `ActivityTicker`, `ComplianceChart`, `TaxSimulator`, `InvoiceDetailSheet`, `App`, `AnimatedCounter`. Every motion variant is gated on the reduced-motion preference.
- Standardised spring presets: `SPRING_CARD = { stiffness: 180, damping: 22 }`, `SPRING_HOVER = { stiffness: 300, damping: 24 }`. Consistency win.
- Stat cards now stagger-fade in by index. Top-grid cards (`ComplianceChart`, `TaxSimulator`, `ActivityTicker`) have spring-eased mount transitions. Tab buttons use `layoutId="activeTabPill"` for the morph-the-pill-between-tabs animation. Reasonable framer-motion idiom.
- `AnimatedCounter` upgraded to quint-out easing and reduced-motion bypass via RAF-deferred setState (avoids the `react-hooks/set-state-in-effect` warning).

Important correctness change inside InvoiceDetailSheet:
- `if (!invoice) return null;` is removed. The component now unconditionally calls `useReducedMotion`, then wraps the panel in `<AnimatePresence>{invoice && (...)}`. This is the correct fix to allow exit animations to play when `invoice` becomes null.
- `App.jsx` correspondingly stops gating `<InvoiceDetailSheet>` on `selectedInvoice` and always mounts it — `invoice={selectedInvoice}` may be null and the sheet handles it.

Security: no input handling, no API calls, pure UI. Two `eslint-disable-next-line no-unused-vars` comments are unnecessary (the imports ARE used) but cosmetic.

Backward compat: visual-only.

Notes (non-blocking, MERGE-CRITICAL):
- **InvoiceDetailSheet.jsx is touched by W5, W6, AND W8.** They each add to different regions of the file but the contention will need a careful manual merge:
  - W5: imports `lazy`/`Suspense`/`useEffect`/`useRef`/`useState`/`Sparkles`/`api`/`ApiError`/`JustificationCanvas`; adds a fetch hook block before the return; adds the canvas section at the top of the body.
  - W6: imports `AnnotationOverlay`; adds a single conditional render in the body.
  - W8: imports `useReducedMotion`; adds `panelReduced` variants; **removes `if (!invoice) return null` and rewires the component to handle null invoices** so AnimatePresence exit can run.
- **W8's null-handling change is load-bearing.** If W5/W6 are merged after W8 and re-introduce the early return (or add hooks before the existing ones in a way that breaks the rules-of-hooks ordering), the drawer will throw at runtime.
- **Recommended merge order: W7 → W6 → W5 → W8.** That puts the most invasive structural change (W8's removal of the early return) on top so it has visibility into both W5's fetch hooks and W6's overlay render.

**Verdict: safe to merge with the file ordering above. Manager must visually verify InvoiceDetailSheet after the merge to confirm: (a) hooks order is consistent, (b) the early-return is gone, (c) both the JustificationCanvas (W5) and AnnotationOverlay (W6) render in the body.**

### W7 — feat/phase-n-liquid-glass @ 0f31d8b — PASS

Diff: 6 files / +528 / -13. Pure frontend visual layer.

- `index.css` — adds 9 new utility classes (`glass-xl`, `glass-shimmer`, `frost-card`, `caustic-border`, `float-in`, `aberrate`, `liquid-pulse`, `drift`, `ambient-bg`) plus a `prefers-reduced-motion` block that freezes every new animation. Backward compatible — `.glass`/`.glass-hover` are untouched.
- `AmbientBackground.jsx` — fixed-position fullscreen backdrop with reduced-motion + `Suspense` + lazy-import for `AmbientScene`.
- `AmbientScene.jsx` — vanilla WebGL fragment shader (no new deps despite the comment about three.js — they wrote raw GL). Caps DPR at 1.25, low-power preference, fails silently if WebGL is unavailable. `aria-hidden`, `pointer-events: none`.
- `App.jsx` — wraps the existing dashboard in a `<div className="relative" style={{zIndex:1}}>` over the new `<AmbientBackground />`. Additive, no shape change.
- `Dashboard.jsx`, `Landing.jsx` — swap `glass` → `frost-card`/`glass-xl` in a few spots. Backward visual.

Security: shader strings are static. No `dangerouslySetInnerHTML`, no untrusted input flows. WebGL contexts can't reach into the DOM.

Backward compat: legacy classes preserved. No JS API change. No new npm deps.

**Verdict: safe to merge as-is.**

### W4 — feat/phase-i-sse-frontend @ ad9b63b — PASS_WITH_NOTES

Diff: 6 files / +284 / -32. Frontend SSE consumer.

- `lib/sse.js` — `openEventStream` now supports a `events` map and `addEventListener`s for each named event, with cleanup on close. Default `onMessage` still fires for both unnamed and named frames (backward compat). Parser is hardened against null/empty.
- `hooks/useSSE.js` — adds exponential backoff (4 retries, 500ms-4s) before falling back to REST polling. Retries clear on unmount, timer is properly cleared. Successful open resets the retry counter.
- `LiveInvoiceStream.jsx` — new render-nothing component that subscribes to `/api/live/stream?session=vendor-<user_id>`, fires Sonner toasts on `invoice.ingested` / `invoice.extracted`, drops heartbeats. Handlers are stable via `useMemo([], [])` — no closure leaks.
- `App.jsx` — opportunistically slows the REST poll from 2s to 15s when SSE is open (via `useVendorLiveStatus` context). Falls back to 2s when context defaults to "idle" — i.e. when App is mounted standalone or SSE is unavailable.
- `VendorShell.jsx` — wraps children in `VendorLiveStatusContext.Provider`, mounts `<LiveInvoiceStream>` once, threads `liveStatus` into the header pill ("Live · SSE stream" / "Live · polling 2s" / "Live · auto-refresh 2s").

Security:
- No reflected user content. Toast bodies use `payload.vendor_display_name || payload.vendor_name`. React JSX escapes — no XSS vector.
- `encodeURIComponent(user.id)` on the session id — good.
- `withCredentials: true` on the EventSource — fine because the backend route lives on the same origin.

Correctness:
- Cleanup is correct: `cancelled` flag, `clearRetryTimer()`, `close()` are all called from the cleanup return.
- The retry-then-poll path is sound: `close = () => {}` is reset between attempts so the next `connect()` rebinds cleanly.
- Status is forwarded via `statusCallbackRef` so the parent can swap callbacks without re-firing the subscribe effect.

Backward compat:
- App still polls at 2s when not under VendorShell — public/landing demo unchanged.
- `openEventStream` callers from earlier rounds still work because both signature additions are optional and the named events also fan-out to `onMessage`.

Notes (non-blocking):
- **Hard dependency on W1 (feat/phase-i-sse-backend)** — must be merged FIRST. Otherwise the EventSource will 404 / 500, the hook will retry 4× in ~7.5s, then fall back to polling. Demo will still function but the header pill will say "Live · polling 2s" instead of "Live · SSE stream".
- The provider-wraps-shell JSX has a slightly unusual indentation (Provider opens at column 4 but the dashboard div opens at column 4 inside it). React doesn't care, but it's slightly odd to read.

**Verdict: safe to merge as-is. ORDER: merge W1 (SSE backend) before W4.**

### W1 — feat/phase-i-sse-backend @ 5b8cdc2 — **FAIL**

Diff: 8 files / +817 / -14 (incl. 490 LoC of tests).

Adds an `asyncio` pub/sub layer to `demo_sessions.py` (`subscribe`, `emit`, `subscriber_count`), a new `routes/live_stream.py` SSE endpoint at `GET /api/live/stream?session=<id>`, and wires `webhook_whatsapp.py` to fan out `invoice.ingested` / `invoice.extracted` frames whenever a challan persists.

Functionally the design is good — bounded queue, set-based dedup of wildcard subscribers, immutable per-frame copies, cleanup in the `subscribe` async generator's `finally` block, an `asyncio.shield` so frames aren't lost during heartbeat windows, and 315 LoC of new tests.

But three issues block merging:

#### Blocker 1 — PII LEAK over a public, unauthenticated endpoint (CRITICAL)

`emit()` ships the raw `feed_entry` dict from the webhook persistence path, which includes `vendor_name`, `gstin`, `invoice_amount`, `invoice_number` — none of those go through `_anonymize()`. Compare to `list_recent()` (used by `/api/live/invoices`) which DOES anonymize before returning.

The `/api/live/stream` endpoint is **deliberately unauthenticated** per its own docstring. Session ids are structurally guessable (`vendor-<numeric_user_id>`). Anyone iterating user_ids 1..1000 can read the live WhatsApp invoice stream for every vendor on the platform, with vendor names and GSTINs intact.

`webhook_whatsapp.py` (lines around 357-365 in the new diff):
```python
feed_entry = {
    "invoice_id": invoice.id,
    "vendor_name": invoice.vendor_name,    # PII
    ...
    "gstin": invoice.gstin,                # PII
}
demo_sessions.append_invoice(session_id, feed_entry)        # OK — list_recent anonymizes on read
demo_sessions.emit(session_id, event_name, feed_entry)       # NOT anonymized
demo_sessions.emit("*", event_name, dict(feed_entry, ...))   # NOT anonymized
```

**Fix**: build a public-safe payload before emit (e.g. `{"vendor_display_name": ..., "amount": ..., "state": ..., "days_remaining": ...}` and drop `vendor_name`, `gstin`, `invoice_number`) — or factor the same `_anonymize()` mapping out of the list path so it can be reused.

#### Blocker 2 — wildcard `session=*` is publicly subscribable (CRITICAL)

`@router.get("/stream")` validates `session: str = Query(..., min_length=1, max_length=128)` — `*` (length 1) passes. `subscribe("*")` registers the caller as a wildcard subscriber and `emit("*", ...)` (called from the webhook for the admin/ops bucket) flows to that subscriber. Combined with Blocker 1, **`curl https://trustaudit.in/api/live/stream?session=*` returns the firehose of every WhatsApp challan from every vendor in real time, with PII intact.**

**Fix**: explicitly reject `*` (and any session id starting with a non-alphanumeric character) in the route handler before calling `subscribe`. Or split the wildcard concept into a separate, auth-gated `/api/admin/stream` endpoint.

#### Blocker 3 — `asyncio.Queue.put_nowait` called from a worker thread (HIGH)

`emit()` is invoked from `_persist_pipeline_result`, which runs inside `asyncio.to_thread(...)` (see `webhook_whatsapp.py:497`). That places the `put_nowait` call on a worker thread, while the queue's owning event loop is the main FastAPI loop. From the asyncio docs: **"This class is not thread safe."**

Concretely, `asyncio.Queue.put_nowait` calls `_wakeup_next` → `Future.set_result(None)` → `loop.call_soon(...)` from the wrong thread. Behavior is undefined; in practice it can drop wakeups (the consumer's `await queue.get()` never wakes), corrupt the queue's internal deque under load, or raise `RuntimeError` once the loop notices a foreign callback.

The new tests do not exercise this path — every test calls `emit()` from the same loop thread that owns the consumer queue, so the race is invisible to CI.

**Fix**: capture `loop = asyncio.get_running_loop()` inside `subscribe`, attach it to the queue (e.g. via a wrapper dataclass), and have `emit` route the `put_nowait` through `loop.call_soon_threadsafe(queue.put_nowait, frame)`.

#### Other observations (non-blocking, but worth noting once the blockers are fixed)

- The route is registered correctly in `main.py`. CORS allowedHeaders did not need updating because EventSource forces simple-CORS and the existing list covers the SSE response.
- `_event_stream` correctly schedules a pre-fetch task before yielding `stream.open` so a frame fired in the gap isn't lost.
- The 30-minute connection cap is reasonable for Render's idle policy; the 15s heartbeat is well below the 60-100s cliff.
- `reset_all` clears subscribers — good test hygiene.

**Verdict: FAIL. Blockers 1 + 2 are PII / data-exfil vulnerabilities that must be fixed before this branch goes anywhere near `main`. Blocker 3 is a correctness landmine that will surface as flaky SSE delivery in production exactly when the demo needs it most.**

### W5 — feat/phase-j-3d-canvas @ edcc71d — PASS_WITH_NOTES

Diff: 2 files / +579 / -1.

- New `JustificationCanvas.jsx` (482 LoC) — react-three-fiber/drei/three.js scene. Confidence sphere + orbit nodes for available fields, ghost wireframe nodes for missing fields, deduction bar, rotating recommendation ribbon. Honors `prefers-reduced-motion`. Lazy WebGL detection via `useState` initialiser, falls back to a CSS-only `Fallback` if WebGL is missing.
- `InvoiceDetailSheet.jsx` — hooks fetch `/api/invoices/{id}/justification` (already exists in `invoice_insights.py`), per-invoice `Map` cache via ref, lazy-loads the canvas via `React.lazy`, handles 401/403/404/network states with distinct UI labels.

Security:
- All imported npm deps (`@react-three/fiber@9.5.0`, `@react-three/drei@10.7.7`, `three@0.183.2`) are **already in `package.json` on main**. No new package installs, no native add-ons.
- Field labels (`field?.label || field?.field_name || "field"`) are rendered inside `<Html>` (drei) which uses real DOM. React JSX text interpolation, escaped — no XSS.
- The fetch goes through the existing `api()` helper which already requires the auth cookie. The endpoint enforces role-based access in `_user_can_view_invoice` — no PII leak path.
- Numeric inputs are coerced via `Number(...) || 0`, arrays via `Array.isArray(...) ? ... : []`. Defensive against schema drift.

Correctness:
- Cache is per-invoice and inside a `useRef(new Map())` — survives re-renders, doesn't leak across drawer instances. `cancelled` flag on the in-flight fetch prevents stale writes.
- Stale guard: `fetchState.id === invoiceId ? ... : null` — never paints data from a previous selection.
- The `useEffect` cleanup correctly returns the cancel closure.

Backward compat:
- Pure additive frontend; no API contract change. The `/api/invoices/{id}/justification` endpoint is already on main.
- Bundle delta: three.js + drei is heavy (~250KB gzipped) but is **lazy-imported** so it only ships when a user opens the drawer.

Notes (non-blocking, but flag for the manager):
- **Both W5 and W6 modify `frontend/src/components/InvoiceDetailSheet.jsx`.** They touch different lines (W6 adds 4 LoC around the existing extraction grid; W5 adds imports + a top-of-body section). A clean merge is likely but the manager should diff the resulting file to confirm both `<JustificationCanvas>` and `<AnnotationOverlay>` are present and rendered in the right order. **Recommend merging W5 then W6 to keep the simpler additive on top.**
- The `Suspense` fallback inside `InvoiceDetailSheet` is a different component (`CanvasFallback`) than the inner `<Suspense fallback={null}>` inside `JustificationCanvas` itself — there are two suspense boundaries; this is fine.

**Verdict: safe to merge as-is. ORDER: W5 before W6.**

### W6 — feat/phase-h2-annotation-overlay @ 697de88 — PASS_WITH_NOTES

Diff: 2 files / +317 / 0. Pure frontend additive.

- New `AnnotationOverlay.jsx` (313 LoC) — fetches `GET /api/invoices/{id}/annotation` (already exists in `invoice_insights.py` on main), draws SVG bounding boxes over the annotated PNG returned by the backend. Hover tooltip with field name + confidence + value.
- `InvoiceDetailSheet.jsx` adds a single conditional `<AnnotationOverlay invoiceId={invoice.id} />` inside the existing drawer body.

Security:
- Text content (`field_name`, `value`, label) is rendered through JSX text interpolation, which React escapes. No XSS vector.
- `box.color` is dropped into SVG `fill`/`stroke` and a `style` background. SVG attribute injection is not a JS execution vector in modern browsers; worst case a malformed color renders incorrectly.
- `data.image` becomes `<img src=…>`. `javascript:` URLs do not execute on `<img src>` in any modern browser, so this is fine. The data comes from the authenticated `/api/invoices/{id}/annotation` endpoint, same trust boundary as the rest of the drawer.
- Fetch uses `credentials: "include"` — correct for authenticated drawer.

Backward compat: purely additive, no API contract change. The conditional render is gated on `invoice?.id != null` so the drawer never breaks for unsaved rows.

Notes (non-blocking):
- The component does not handle the case where the backend returns 404 vs 500 vs network failure with different UI states — they all collapse to "Annotation unavailable". OK for demo.
- No new npm deps.
- No ESLint blockers spotted.

**Verdict: safe to merge as-is.**

## Summary

### Branch state at review-completion

By the time I finished reviewing all ten branches, the **manager had already merged W1, W3, W4, W5, W6, W7, W8, W9, and W10 into `origin/main`** (commit chain `8aff18b → 7ca0206`). W2 has not yet been merged.

That means the W1 PII leak and wildcard-subscription vulnerability I flagged are **already on `main`** and therefore on the path to deploy. The manager merged W1 before reviewing my verdict.

### Final tally

| Verdict           | Count | Workers                  |
|-------------------|-------|--------------------------|
| PASS              | 3     | W3, W7, W9               |
| PASS_WITH_NOTES   | 6     | W2, W4, W5, W6, W8, W10  |
| FAIL              | 1     | **W1** (already merged)   |

### Recommended merge order (for the work that is still on a branch)

W2 is the only outstanding branch and is safe to merge as-is. Once W2 is in:

1. Merge `feat/phase-k-smoke-1114` (W2). Pure additive smoke sections.

For everything else: nothing is left to merge — main already has W1, W3, W4, W5, W6, W7, W8, W9, W10.

### Blockers — W1 must be remediated on `main` before any production deploy

W1's three issues are all on main right now:

1. **CRITICAL — PII leak** (`backend/app/routes/webhook_whatsapp.py`, around line 360):
   - `demo_sessions.emit(session_id, event_name, feed_entry)` ships `vendor_name`, `gstin`, `invoice_number` to the public, unauthenticated SSE endpoint.
   - **Fix**: build a public-safe payload (vendor_display_name, amount, state, days_remaining, optional invoice_id only) before calling `emit`. Reuse the existing `_anonymize` mapping out of `services/demo_sessions.py`.

2. **CRITICAL — wildcard `session=*` is publicly subscribable** (`backend/app/routes/live_stream.py`):
   - `Query(..., min_length=1, max_length=128)` accepts `*`.
   - `subscribe("*")` sees every event from every session because `emit("*", …)` is fanned out from the webhook unconditionally.
   - **Fix**: explicitly reject `*` and any session id starting with a non-`[a-zA-Z0-9_-]` character at the route layer. Or split the wildcard concept into a separate auth-gated `/api/admin/stream`.

3. **HIGH — `asyncio.Queue.put_nowait` called from a worker thread** (`backend/app/services/demo_sessions.py:emit`):
   - `_persist_pipeline_result` runs inside `asyncio.to_thread` (`webhook_whatsapp.py:497`).
   - `emit` therefore calls `put_nowait` from a non-loop thread, which `asyncio.Queue` documents as not thread-safe. Wakeups can be dropped or the future can be left in an inconsistent state.
   - **Fix**: capture `loop = asyncio.get_running_loop()` inside `subscribe`, attach it to a wrapper around the queue, and route `put_nowait` calls through `loop.call_soon_threadsafe`.

The W1 tests do not exercise the cross-thread path (every test calls `emit` from the same loop thread that owns the consumer queue), so CI cannot catch issue #3.

### Smoke / e2e gaps to close before the demo

- **W2 / W10 do not test for PII on `/api/live/stream` or `/api/live/invoices?session=*`**. A two-line addition to the smoke and a single Playwright spec would catch the W1 leak. Strongly recommend before going live.
- **W10's catch-all `test.fixme` on Vite-error overlay** masks production-build regressions. Convert to a hard failure post-demo.

### Cross-cutting merge concerns (already resolved by the manager — verify visually)

- **InvoiceDetailSheet.jsx** is touched by W5, W6, AND W8. The recommended order to keep hooks ordering and the null-invoice handling intact is **W7 → W6 → W5 → W8**. Manager has already merged in this region — operator should manually inspect the merged file once to confirm:
  - Hooks (`useReducedMotion`, `useState`, `useRef`, `useEffect`) are called unconditionally at the top of the function (no early return before them).
  - Both `<JustificationCanvas>` (W5) and `<AnnotationOverlay>` (W6) are present in the body.
  - The `panel`/`panelReduced` variants from W8 are wired correctly.
  - The `if (!invoice) return null;` early return is removed and replaced with `{invoice && (...)}` inside `<AnimatePresence>`.

### Bottom line

- 9/10 branches are clean enough to merge.
- W2 is the last branch; merge it.
- **W1 needs three fixes BEFORE the demo** — the security issues are real, the demo is tomorrow, and the cross-thread bug is a flake risk during the demo itself. Recommend applying the three fixes inline on `main` (as a follow-up commit) before the deploy.

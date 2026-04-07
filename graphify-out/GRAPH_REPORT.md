# Graph Report - .  (2026-04-07)

## Corpus Check
- Large corpus: 292 files · ~1,039,181 words. Semantic extraction will be expensive (many Claude tokens). Consider running on a subfolder, or use --no-semantic to run AST-only.

## Summary
- 1549 nodes · 3129 edges · 62 communities detected
- Extraction: 50% EXTRACTED · 50% INFERRED · 0% AMBIGUOUS · INFERRED: 1558 edges (avg confidence: 0.5)
- Token cost: 0 input · 0 output

## God Nodes (most connected - your core abstractions)
1. `User` - 174 edges
2. `UserIdentity` - 96 edges
3. `ExtractionResult` - 95 edges
4. `Invoice` - 56 edges
5. `MockVisionClient` - 44 edges
6. `MSME` - 37 edges
7. `_empty_extraction()` - 36 edges
8. `GeminiVisionClient` - 34 edges
9. `TwilioClient` - 32 edges
10. `Dispute` - 29 edges

## Surprising Connections (you probably didn't know these)
- `FastAPI dependencies for protected routes.  Exports: - ``SESSION_COOKIE_NAME`` —` --uses--> `User`  [INFERRED]
  backend/app/auth/dependencies.py → backend/app/models.py
- `Prefer explicit cookie param, fall back to request.cookies.      FastAPI's ``Coo` --uses--> `User`  [INFERRED]
  backend/app/auth/dependencies.py → backend/app/models.py
- `Return the signed-in user or raise 401.      Touches ``last_seen_at`` on success` --uses--> `User`  [INFERRED]
  backend/app/auth/dependencies.py → backend/app/models.py
- `Like ``current_user`` but returns None instead of raising.` --uses--> `User`  [INFERRED]
  backend/app/auth/dependencies.py → backend/app/models.py
- `True when we should set ``Secure`` on the session cookie.` --uses--> `User`  [INFERRED]
  backend/app/auth/dependencies.py → backend/app/models.py

## Communities

### Community 0 - "community_0"
Cohesion: 0.02
Nodes (146): annotate_image(), AnnotatedImage, _color_for(), _compute_boxes(), _downscale(), _draw_label(), FieldBox, _format_label() (+138 more)

### Community 1 - "community_1"
Cohesion: 0.03
Nodes (124): AuthError, consume_magic_link(), _find_existing_user(), InvalidMagicLinkToken, MagicLinkError, Email magic-link (passwordless) auth provider.  Flow: 1. ``request_magic_link(em, Validate and consume a magic-link token. Returns the authenticated user.      Ra, Generic magic-link failure (invalid / expired / consumed). (+116 more)

### Community 2 - "community_2"
Cohesion: 0.04
Nodes (70): _build_audit_trail(), _build_context(), _calc_days_remaining(), _ensure_cache_dir(), get_compliance_pdf(), _load_invoice_or_404(), 43B(h) compliance form rendering + government submission gate.  Endpoints ------, Best-effort one-line summary of a challan event for the audit trail. (+62 more)

### Community 3 - "community_3"
Cohesion: 0.03
Nodes (89): BaseModel, get_db(), SQLite database configuration for TrustAudit MVP., Dependency: yields a DB session, closes on completion., clear_session_cookie(), current_user(), current_user_optional(), _extract_token() (+81 more)

### Community 4 - "community_4"
Cohesion: 0.05
Nodes (57): BaileysClient, _now_iso(), Baileys WhatsApp provider — HTTP bridge to the Node sidecar.  The sidecar lives, Talks to the Node baileys sidecar over HTTP., InboundMessage, Raised when a provider is selected but required env vars are missing.      The :, An incoming WhatsApp message after it has been normalized.      Immutable by des, WhatsAppProviderNotConfigured (+49 more)

### Community 5 - "community_5"
Cohesion: 0.05
Nodes (29): Enum, PipelineResult, Output of a full pipeline run — consumed by the webhook handler., can_transition(), determine_target_state_after_extraction(), _guard_extraction_high_quality(), _guard_extraction_low_quality(), InvoiceState (+21 more)

### Community 6 - "community_6"
Cohesion: 0.06
Nodes (48): EmailProvider, EmailProviderNotConfigured, EmailSendResult, Abstract base types for WhatsApp providers.  All providers (twilio, baileys, moc, Raised when a provider's required env vars are missing., Return value from ``EmailProvider.send``.      ``provider`` is the short name (', Send transactional email. Implementations are synchronous., Duck-typed interface every WhatsApp provider must satisfy. (+40 more)

### Community 7 - "community_7"
Cohesion: 0.08
Nodes (19): _empty_extraction(), _make_blurry_jpeg(), _make_bright_saturated_jpeg(), _make_dark_jpeg(), _make_jpeg(), _make_sharp_jpeg(), Tests for the 39-case edge-case detector catalog.  One test per implemented dete, Detector is a stub — duplication is handled by the pipeline. (+11 more)

### Community 8 - "community_8"
Cohesion: 0.06
Nodes (44): _build_live_url(), _build_wa_link(), demo_health(), demo_qr(), HealthResponse, new_session(), NewSessionResponse, Demo-session orchestration routes.  Endpoints:  * ``POST /api/demo/new-session`` (+36 more)

### Community 9 - "community_9"
Cohesion: 0.07
Nodes (10): _FakeHttpxClient, _FakeHttpxResponse, _make_id_token(), patched_jwks(), rsa_keypair(), _set_client_id_env(), shared_engine(), TestOAuthGoogleRoute (+2 more)

### Community 10 - "community_10"
Cohesion: 0.1
Nodes (22): FacebookAuthError, FacebookNotConfigured, _fetch_user_profile(), _get_app_id(), _get_app_secret(), signin_with_facebook(), verify_facebook_access_token(), _verify_with_debug_token() (+14 more)

### Community 11 - "community_11"
Cohesion: 0.07
Nodes (39): _assessment_year(), build_template_dict(), ComplianceFormContext, compute_audit_hash(), _confidence_color(), _format_audit_trail_rows(), _format_human_date(), _format_human_datetime() (+31 more)

### Community 12 - "community_12"
Cohesion: 0.1
Nodes (9): _make_ctx(), Unit tests for the 43B(h) compliance form PDF renderer.  The WeasyPrint native l, If WeasyPrint genuinely cannot be imported, we get a clear error., test_render_pdf_raises_when_weasyprint_unavailable(), TestBuildTemplateDict, TestComputeAuditHash, TestQRCodes, TestRenderHtml (+1 more)

### Community 13 - "community_13"
Cohesion: 0.07
Nodes (20): Tests for the in-memory demo session store.  Covers: * Happy-path session creati, Different sessions can have different A/B assignments., 27th vendor should be AA, not crash., Run ``coro`` to completion on a fresh event loop and return the result., Cancelling the consumer task must remove its queue from the     subscriber set s, Adversary 7926af6 #20 — id namespace must be ≥ 64 bits to defeat     brute-force, A stalled consumer must not wedge emit(). The oldest frame gets     dropped so t, Adversary 7926af6 #7 — refuse to silently share a session bucket     between two (+12 more)

### Community 14 - "community_14"
Cohesion: 0.1
Nodes (10): _IdempotencyStore, mark_seen_if_new(), In-memory idempotency store for WhatsApp webhooks.  Two independent dedup layers, Record an image hash → invoice mapping.          If ``invoice_id`` is falsy (0 o, # TODO: replace with rate_limits table when W10 wires the DB session dep, Atomic check-and-set. True if new, False if already seen., Test helper: clear both dedup layers., Thread-safe in-memory store used by all module-level helpers. (+2 more)

### Community 15 - "community_15"
Cohesion: 0.09
Nodes (9): app(), Tests for ``auth.dependencies`` — current_user / current_user_optional / require, A minimal FastAPI app exposing endpoints that exercise each dependency., Create one vendor and one driver, plus a session for each., seed_users_and_sessions(), SessionLocal(), TestCurrentUser, TestCurrentUserOptional (+1 more)

### Community 16 - "community_16"
Cohesion: 0.23
Nodes (16): Session, create_session(), _hash_token(), load_session(), _naive_utc(), Database-backed session management.  Design: - Raw session token = 256 bits of e, Update ``last_seen_at``. Call on every authenticated request., Mark a session as revoked. Returns True if a row was updated. (+8 more)

### Community 17 - "community_17"
Cohesion: 0.14
Nodes (17): auto_orient(), boost_shadows(), compress_highlights(), compute_sha256(), downsize_if_large(), image_stats(), Pure-PIL image preprocessors for the vision pipeline.  Everything here is idempo, Reduce washed-out glare regions. (+9 more)

### Community 18 - "community_18"
Cohesion: 0.12
Nodes (17): _frames_for(), Adversary R3 hotfix regression tests for the SSE live-stream endpoint.  Three is, Helper: subscribe, run ``emit_fn``, return drained frames., Sanity: a payload that omits PII keys round-trips intact., Regression for adversary R3 #1: when the webhook handler builds     its SSE payl, Issue #1 + #2 together: even if a wildcard subscriber were to     register (impo, ``emit`` must be safe to call from a thread other than the one     running the s, ``session=*`` must be rejected with HTTP 400. (+9 more)

### Community 19 - "community_19"
Cohesion: 0.11
Nodes (7): Integration tests for the /api/webhook/whatsapp/inbound router.  These tests exe, Adversary must-fix #1: replies must never interpolate invoice_id=0.      We pre-, Adversary regression: every accepted inbound must (a) push a     user-visible ac, Reset idempotency + rate-limit + mock provider state before each test.      Also, _reset_state(), test_inbound_fires_immediate_ack_and_records_outbound_observability(), test_webhook_user_reply_never_says_invoice_zero()

### Community 20 - "community_20"
Cohesion: 0.12
Nodes (7): _RateLimiter, In-memory sliding-window rate limiter.  Keyed by a composite of ``{kind}:{key}``, Test helper: clear every bucket and blocklist entry., Return True if the request is allowed, False if rate-limited., Add a composite key to the blocklist for ``seconds`` seconds., Test helper — returns (bucket_size, blocklist_size)., reset_rate_limit_state()

### Community 21 - "community_21"
Cohesion: 0.17
Nodes (12): Tests for the Phase I Server-Sent Events stream.  Covers:  * Pub/sub delivery —, Smoke the ``/api/live/stream`` HTTP surface.      We drive the ASGI app directly, Drive the async generator directly to avoid Render-style timeouts., Ensure every test starts from a clean pub/sub state., Run ``coro`` on a fresh event loop and return its result., _reset_store(), _run(), test_disconnect_cleans_up_subscriber_queue() (+4 more)

### Community 22 - "community_22"
Cohesion: 0.13
Nodes (0): 

### Community 23 - "community_23"
Cohesion: 0.14
Nodes (13): api_client(), challan_fixture_dir(), challan_fixture_path(), db_engine(), db_session(), Shared pytest fixtures for the TrustAudit backend test suite.  Provides: * ``db_, Factory: ``path = challan_fixture_path('perfect_tally_printed.jpg')``., Clear the in-memory MockClient SENT_MESSAGES list before AND after a test. (+5 more)

### Community 24 - "community_24"
Cohesion: 0.21
Nodes (10): build_justification(), _build_recommendations(), FieldSummary, JustificationPayload, Pure tax-justification engine for an extracted invoice.  Given an :class:`Invoic, Compute the JustificationPayload for a single invoice.      Parameters     -----, One line in the available/missing ledger., One action the vendor can take to recover more money. (+2 more)

### Community 25 - "community_25"
Cohesion: 0.31
Nodes (10): _fake_response(), _make_client(), test_download_media_returns_bytes_and_uses_auth(), test_health_degraded_on_error(), test_health_ok_on_200(), test_parse_inbound_invalid_num_media_defaults_to_zero(), test_parse_inbound_no_media(), test_parse_inbound_realistic_twilio_payload() (+2 more)

### Community 26 - "community_26"
Cohesion: 0.18
Nodes (11): compute_twilio_signature(), is_hard_enforce(), is_validation_enabled(), Twilio webhook signature verification.  Twilio signs every webhook POST with an, Raised when the X-Twilio-Signature header does not match the computed HMAC., Compute the expected X-Twilio-Signature value for a given URL + params.      ``u, Return True iff ``signature_header`` matches the expected HMAC for     (url, par, Gate signature validation via env var so mock / dev paths still work.      Set ` (+3 more)

### Community 27 - "community_27"
Cohesion: 0.2
Nodes (9): calibrate_confidence(), canonicalize_date(), normalize_gstin(), parse_inr_amount(), Postprocessors — normalize dates, amounts, GSTINs; calibrate confidence.  All fu, Parse an INR amount string into rupees as a float.      Handles:       - plain n, Uppercase, strip whitespace, validate 15-char GSTIN format.      Returns None on, Return a final confidence ∈ [0, 1] after applying edge-case penalties.      Each (+1 more)

### Community 28 - "community_28"
Cohesion: 0.2
Nodes (1): Tests for the in-memory webhook idempotency store.

### Community 29 - "community_29"
Cohesion: 0.2
Nodes (1): Tests for the in-memory sliding-window rate limiter.

### Community 30 - "community_30"
Cohesion: 0.2
Nodes (3): End-to-end smoke tests for the TrustAudit FastAPI app.  These tests boot the rea, Verify the webhook ingests a mock-style multipart payload end-to-end.      Uses, test_webhook_inbound_accepts_mock_multipart_with_fixture()

### Community 31 - "community_31"
Cohesion: 0.27
Nodes (5): _make_user(), test_invoice_full_new_fields_populated(), test_metadata_create_all_registers_every_new_table(), test_user_identity_unique_constraint(), test_verification_code_and_session_insert()

### Community 32 - "community_32"
Cohesion: 0.27
Nodes (1): AboutPage

### Community 33 - "community_33"
Cohesion: 0.2
Nodes (1): InvoiceDrawer

### Community 34 - "community_34"
Cohesion: 0.36
Nodes (8): banner(), divider(), main(), Print text character by character for dramatic effect., Print a step with emoji prefix and a dramatic pause., Print the opening banner., slow_print(), step()

### Community 35 - "community_35"
Cohesion: 0.47
Nodes (8): _fake_response(), _make_client(), test_download_media_returns_raw_bytes(), test_health_ok_from_sidecar(), test_health_unreachable_on_exception(), test_parse_inbound_baileys_payload(), test_parse_inbound_generates_sid_when_missing(), test_send_text_posts_to_sidecar()

### Community 36 - "community_36"
Cohesion: 0.25
Nodes (1): PublicLivePage

### Community 37 - "community_37"
Cohesion: 0.32
Nodes (7): _event_stream(), _format_sse(), Server-Sent Events (SSE) endpoint for the public live demo dashboard.  Route ---, Open a named SSE stream for the given demo session id.      Adversary R3 hotfix:, Encode a dict as a named SSE frame.      Each line of a multi-line payload would, Yield SSE-formatted strings for one subscriber.      Emits an initial ``stream.o, stream_live_events()

### Community 38 - "community_38"
Cohesion: 0.25
Nodes (7): In-memory ring buffer for the last N inbound webhook hits.  Lets a developer (or, Append a single observation to the ring buffer.      All fields are optional exc, Return a copy of the buffer, newest-first, capped at ``limit``., Clear the buffer (test-only)., record(), reset(), snapshot()

### Community 39 - "community_39"
Cohesion: 0.36
Nodes (1): SignInPage

### Community 40 - "community_40"
Cohesion: 0.25
Nodes (1): VendorDashboardPage

### Community 41 - "community_41"
Cohesion: 0.25
Nodes (1): VerifyPage

### Community 42 - "community_42"
Cohesion: 0.7
Nodes (4): _create_all(), _create_monitor(), main(), _print_manual_instructions()

### Community 43 - "community_43"
Cohesion: 0.5
Nodes (1): ApiError

### Community 44 - "community_44"
Cohesion: 0.5
Nodes (3): Read-only debug endpoints for the demo deployment.  Exposes the in-memory webhoo, Return the most recent inbound webhook hits, newest-first.      Use this to veri, recent_inbounds()

### Community 45 - "community_45"
Cohesion: 0.67
Nodes (3): _draw_placeholder(), main(), Write an 800x1200 white JPEG with the fixture name + summary text.

### Community 46 - "community_46"
Cohesion: 0.67
Nodes (0): 

### Community 47 - "community_47"
Cohesion: 1.0
Nodes (2): main(), _prompt()

### Community 48 - "community_48"
Cohesion: 1.0
Nodes (0): 

### Community 49 - "community_49"
Cohesion: 1.0
Nodes (0): 

### Community 50 - "community_50"
Cohesion: 1.0
Nodes (0): 

### Community 51 - "community_51"
Cohesion: 1.0
Nodes (0): 

### Community 52 - "community_52"
Cohesion: 1.0
Nodes (0): 

### Community 53 - "community_53"
Cohesion: 1.0
Nodes (0): 

### Community 54 - "community_54"
Cohesion: 1.0
Nodes (0): 

### Community 55 - "community_55"
Cohesion: 1.0
Nodes (0): 

### Community 56 - "community_56"
Cohesion: 1.0
Nodes (0): 

### Community 57 - "community_57"
Cohesion: 1.0
Nodes (0): 

### Community 58 - "community_58"
Cohesion: 1.0
Nodes (0): 

### Community 59 - "community_59"
Cohesion: 1.0
Nodes (0): 

### Community 60 - "community_60"
Cohesion: 1.0
Nodes (0): 

### Community 61 - "community_61"
Cohesion: 1.0
Nodes (0): 

## Knowledge Gaps
- **165 isolated node(s):** `Print text character by character for dramatic effect.`, `Print a step with emoji prefix and a dramatic pause.`, `Print the opening banner.`, `SQLAlchemy models for TrustAudit — Invoice tracking with 43B(h) compliance.  Thi`, `SQLite database configuration for TrustAudit MVP.` (+160 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **Thin community `community_48`** (2 nodes): `vendorLiveStatus.js`, `useVendorLiveStatus()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `community_49`** (2 nodes): `useInvoices.js`, `useInvoices()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `community_50`** (2 nodes): `useSSE.js`, `useSSE()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `community_51`** (2 nodes): `sse.js`, `openEventStream()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `community_52`** (2 nodes): `cn.js`, `cn()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `community_53`** (2 nodes): `index.js`, `startSock()`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `community_54`** (1 nodes): `vite.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `community_55`** (1 nodes): `eslint.config.js`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `community_56`** (1 nodes): `playwright.config.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `community_57`** (1 nodes): `important.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `community_58`** (1 nodes): `smoke.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `community_59`** (1 nodes): `auth.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `community_60`** (1 nodes): `whatsapp_pipeline.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.
- **Thin community `community_61`** (1 nodes): `critical.spec.ts`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `User` connect `community_1` to `community_2`, `community_3`, `community_4`, `community_6`, `community_9`, `community_10`, `community_15`, `community_16`?**
  _High betweenness centrality (0.205) - this node is a cross-community bridge._
- **Why does `ExtractionResult` connect `community_0` to `community_5`, `community_6`, `community_7`?**
  _High betweenness centrality (0.130) - this node is a cross-community bridge._
- **Why does `UserIdentity` connect `community_1` to `community_9`, `community_2`, `community_10`, `community_6`?**
  _High betweenness centrality (0.056) - this node is a cross-community bridge._
- **Are the 171 inferred relationships involving `User` (e.g. with `TrustAudit Production Seed — 50 realistic Indian MSME invoices plus the YC-demo` and `Hash a password the same way ``backend/app/auth/passwords.py`` does.      We del`) actually correct?**
  _`User` has 171 INFERRED edges - model-reasoned connections that need verification._
- **Are the 93 inferred relationships involving `UserIdentity` (e.g. with `PhoneOtpError` and `PhoneOtpNotConfigured`) actually correct?**
  _`UserIdentity` has 93 INFERRED edges - model-reasoned connections that need verification._
/**
 * Unit tests for WhatsApp sidecar self-spam filter predicates.
 *
 * These cover the two filters added to suppress history-sync replay:
 *   - self-JID filter: drops messages whose sender matches the paired phone
 *   - stale-message filter: drops messages older than SIDECAR_STARTED_AT
 *
 * Run: node --test index.test.js
 *
 * Uses node's built-in node:test module (no new dependencies).
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  shouldSkipSelfMessage,
  shouldSkipStaleMessage,
  SIDECAR_STARTED_AT,
} = require('./index.js');

// ---------------------------------------------------------------------------
// shouldSkipSelfMessage
// ---------------------------------------------------------------------------

test('self-jid filter: skips when sender phone matches paired phone', () => {
  assert.equal(shouldSkipSelfMessage('14155551234', '14155551234'), true);
});

test('self-jid filter: keeps messages from a different sender', () => {
  assert.equal(shouldSkipSelfMessage('14155559999', '14155551234'), false);
});

test('self-jid filter: keeps when myPhone is empty (not yet paired)', () => {
  assert.equal(shouldSkipSelfMessage('14155551234', ''), false);
});

test('self-jid filter: keeps when both sides are empty strings', () => {
  // Defensive: an empty fromPhone should not spuriously match empty myPhone.
  assert.equal(shouldSkipSelfMessage('', ''), false);
});

test('self-jid filter: is case-sensitive / exact match on digits', () => {
  // Phones are digits-only after JID stripping — but assert that substring
  // matches do not fool the predicate.
  assert.equal(shouldSkipSelfMessage('14155551234', '141555512'), false);
  assert.equal(shouldSkipSelfMessage('141555512', '14155551234'), false);
});

// ---------------------------------------------------------------------------
// shouldSkipStaleMessage
// ---------------------------------------------------------------------------

test('stale-message filter: skips messages older than sidecarStartedAt', () => {
  const started = 1_700_000_000;
  const olderTs = started - 60; // 60s before start
  assert.equal(shouldSkipStaleMessage(olderTs, started), true);
});

test('stale-message filter: keeps messages newer than sidecarStartedAt', () => {
  const started = 1_700_000_000;
  const newerTs = started + 5; // 5s after start
  assert.equal(shouldSkipStaleMessage(newerTs, started), false);
});

test('stale-message filter: keeps messages with ts === 0 (Baileys missing field)', () => {
  // A zero timestamp means Baileys did not populate messageTimestamp —
  // treat as unknown and forward rather than silently drop.
  assert.equal(shouldSkipStaleMessage(0, 1_700_000_000), false);
});

test('stale-message filter: keeps messages with ts exactly at sidecarStartedAt', () => {
  // Equal is not strictly older — forward it.
  const started = 1_700_000_000;
  assert.equal(shouldSkipStaleMessage(started, started), false);
});

test('stale-message filter: keeps when msgTimestamp is null/undefined', () => {
  assert.equal(shouldSkipStaleMessage(null, 1_700_000_000), false);
  assert.equal(shouldSkipStaleMessage(undefined, 1_700_000_000), false);
});

test('stale-message filter: coerces string timestamps (Baileys can emit Long/string)', () => {
  const started = 1_700_000_000;
  assert.equal(shouldSkipStaleMessage(String(started - 60), started), true);
  assert.equal(shouldSkipStaleMessage(String(started + 60), started), false);
});

// ---------------------------------------------------------------------------
// SIDECAR_STARTED_AT constant initialization
// ---------------------------------------------------------------------------

test('SIDECAR_STARTED_AT is initialized within 10s grace window of now', () => {
  // The constant is computed at module import time as
  //   Math.floor(Date.now() / 1000) - 10
  // So at test time, (now - SIDECAR_STARTED_AT) should be >= 10 and small
  // (bounded by how long the test suite has been running — generously <60s).
  const nowSec = Math.floor(Date.now() / 1000);
  const delta = nowSec - SIDECAR_STARTED_AT;
  assert.ok(
    delta >= 10,
    `expected SIDECAR_STARTED_AT to lag now by >=10s (grace window), got delta=${delta}`,
  );
  assert.ok(
    delta < 60,
    `expected SIDECAR_STARTED_AT to be recent (<60s old), got delta=${delta}`,
  );
});

test('SIDECAR_STARTED_AT is an integer unix-seconds value', () => {
  assert.equal(typeof SIDECAR_STARTED_AT, 'number');
  assert.equal(Number.isInteger(SIDECAR_STARTED_AT), true);
  assert.ok(SIDECAR_STARTED_AT > 1_600_000_000, 'should be a sane unix timestamp');
});

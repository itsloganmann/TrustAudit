#!/usr/bin/env node
/**
 * TrustAudit WhatsApp Sidecar
 *
 * Minimal baileys bridge. Connects to WhatsApp using multi-file auth state,
 * prints a QR code to the terminal for pairing, and exposes a tiny HTTP API
 * the Python backend uses to send and download messages.
 *
 * Endpoints:
 *   POST /wa/send      { to, body }       -> { sid, status }
 *   POST /wa/download  { media_id }       -> binary bytes
 *   GET  /wa/health                       -> { provider, status, phone }
 *
 * On incoming messages, forwards a JSON payload to
 *   ${BACKEND_URL}/api/webhook/whatsapp/inbound
 */

const express = require('express');
const fs = require('fs');
const qrcode = require('qrcode-terminal');
const pino = require('pino');

let makeWASocket;
let useMultiFileAuthState;
let DisconnectReason;
let downloadMediaMessage;
let Browsers;
let fetchLatestBaileysVersion;

try {
  const baileys = require('baileys');
  makeWASocket = baileys.default || baileys.makeWASocket;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  downloadMediaMessage = baileys.downloadMediaMessage;
  Browsers = baileys.Browsers;
  fetchLatestBaileysVersion = baileys.fetchLatestBaileysVersion;
} catch (err) {
  console.error('[sidecar] baileys not installed — run `npm install` first.');
  console.error(err.message);
}

const logger = pino({ level: process.env.LOG_LEVEL || 'info' });

const PORT = parseInt(process.env.PORT || '3001', 10);
const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:8000';

let sock = null;
let connectionStatus = 'disconnected';
let phoneNumber = null;
const pendingMedia = new Map(); // media_id -> message

// Used to drop chat-history-sync messages that arrive immediately after a
// fresh pair. We only want to forward NEW inbounds (sent after the sidecar
// started), not replays of historical messages from the user's existing chats.
// 10s grace window allows for slight clock skew between WhatsApp and the host.
const SIDECAR_STARTED_AT = Math.floor(Date.now() / 1000) - 10;

// ---------------------------------------------------------------------------
// Pure filter predicates (extracted for unit testing)
// ---------------------------------------------------------------------------

/**
 * Should we skip a message because its sender is our own paired number?
 *
 * Multi-device sync sometimes replays messages WE sent from another linked
 * device with fromMe=false but with our own JID as the sender. Without this
 * guard the webhook auto-replies back into our own chats.
 *
 * @param {string} fromPhone - phone digits of the sender (no @s.whatsapp.net)
 * @param {string} myPhone   - phone digits of the paired sidecar (may be empty)
 * @returns {boolean} true if the message should be skipped
 */
function shouldSkipSelfMessage(fromPhone, myPhone) {
  if (!myPhone) return false;
  return fromPhone === myPhone;
}

/**
 * Should we skip a message because it's older than the sidecar's start time?
 *
 * Baileys delivers recent chat history on first pair via messages.upsert with
 * type "notify" — those would otherwise spam the webhook with N replies for
 * every old conversation. A 0 timestamp (Baileys missing field) is treated as
 * "unknown" and kept.
 *
 * @param {number} msgTimestamp     - unix seconds from msg.messageTimestamp
 * @param {number} sidecarStartedAt - unix seconds baseline (with grace window)
 * @returns {boolean} true if the message should be skipped as stale
 */
function shouldSkipStaleMessage(msgTimestamp, sidecarStartedAt) {
  const ts = Number(msgTimestamp || 0);
  if (!ts) return false;
  return ts < sidecarStartedAt;
}

async function startSock() {
  if (!makeWASocket) {
    logger.warn('baileys unavailable; sidecar running in degraded mode');
    connectionStatus = 'degraded';
    return;
  }
  // Auth state dir is env-configurable so the Render persistent disk
  // (/app/data/baileys_sessions) survives container restarts without
  // forcing a re-pair. Local dev keeps the repo-relative ./sessions.
  const sessionsDir = process.env.BAILEYS_SESSIONS_DIR || './sessions';
  const { state, saveCreds } = await useMultiFileAuthState(sessionsDir);
  // Pin to the current WhatsApp Web protocol version so device registration
  // doesn't 405 against a bumped server. The Ubuntu-Chrome stub the old
  // code used gets rejected by WhatsApp on fresh pairs.
  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info({ version, isLatest }, 'using baileys web version');
  sock = makeWASocket({
    auth: state,
    version,
    // Ubuntu-Chrome is the library default and gets flagged less often by
    // WhatsApp's anti-bot heuristics than custom / macOS fingerprints.
    browser: Browsers.ubuntu('Chrome'),
    printQRInTerminal: false,
    syncFullHistory: false,
    generateHighQualityLinkPreview: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      connectionStatus = 'qr_pending';
      qrcode.generate(qr, { small: true });
      // Persist the raw QR string next to the auth state so the admin
      // endpoint (backend/app/routes/admin.py) can serve it for headless
      // pairing on Render.
      try {
        fs.mkdirSync(sessionsDir, { recursive: true });
        fs.writeFileSync(`${sessionsDir}/current_qr.txt`, qr);
      } catch (e) { logger.warn({ e: e.message }, 'qr file write failed'); }
      logger.info('Scan the QR code above with your WhatsApp mobile app.');

      // Pairing-code flow — regenerate on EVERY QR rotation so the file
      // always holds a fresh, valid code. Baileys ties the 8-char code to
      // the current QR session, so when the QR rotates the old code is
      // dead. Writing a new code each rotation gives the user a stable
      // file they can re-read whenever they're ready to type.
      if (process.env.PAIRING_PHONE && sock && !sock.authState.creds.registered) {
        const phone = process.env.PAIRING_PHONE.replace(/\D/g, '');
        sock.requestPairingCode(phone)
          .then((code) => {
            logger.info({ phone, code, rotation: Date.now() }, 'pairing code rotated');
            try {
              fs.mkdirSync(sessionsDir, { recursive: true });
              fs.writeFileSync(`${sessionsDir}/current_pair_code.txt`, code);
            } catch (e) {
              logger.warn({ e: e.message }, 'pair code file write failed');
            }
          })
          .catch((err) => {
            logger.error({ err: err.message }, 'requestPairingCode failed');
          });
      }
    }
    if (connection === 'open') {
      connectionStatus = 'connected';
      phoneNumber = sock.user && sock.user.id ? sock.user.id.split(':')[0] : null;
      try { fs.unlinkSync(`${sessionsDir}/current_qr.txt`); } catch (_) { /* ignore */ }
      try { fs.unlinkSync(`${sessionsDir}/current_pair_code.txt`); } catch (_) { /* ignore */ }
      logger.info({ phoneNumber }, 'WhatsApp connected');
    }
    if (connection === 'close') {
      const code = lastDisconnect && lastDisconnect.error && lastDisconnect.error.output
        ? lastDisconnect.error.output.statusCode
        : null;
      const shouldReconnect = DisconnectReason
        ? code !== DisconnectReason.loggedOut
        : true;
      connectionStatus = 'disconnected';
      logger.warn({ code, shouldReconnect }, 'WhatsApp disconnected');
      if (shouldReconnect) {
        setTimeout(startSock, 2000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;

      const from = msg.key.remoteJid || '';
      const fromPhone = from.replace('@s.whatsapp.net', '').replace('@g.us', '');

      // Skip if the sender is the paired number itself (self-spam guard).
      const myJidRaw = (sock.user && sock.user.id) ? sock.user.id : '';
      const myPhone = myJidRaw.split(':')[0].replace('@s.whatsapp.net', '');
      if (shouldSkipSelfMessage(fromPhone, myPhone)) {
        logger.debug({ fromPhone }, 'skip: self-jid');
        continue;
      }

      // Skip messages older than the sidecar's start time (history replay).
      const msgTs = Number(msg.messageTimestamp || 0);
      if (shouldSkipStaleMessage(msgTs, SIDECAR_STARTED_AT)) {
        logger.debug({ msgTs, sidecarStarted: SIDECAR_STARTED_AT }, 'skip: stale msg');
        continue;
      }
      const text =
        msg.message.conversation ||
        (msg.message.extendedTextMessage && msg.message.extendedTextMessage.text) ||
        null;

      let mediaUrl = null;
      let mediaType = null;
      if (msg.message.imageMessage) {
        mediaType = msg.message.imageMessage.mimetype || 'image/jpeg';
        mediaUrl = msg.key.id; // use message id as the download handle
        pendingMedia.set(msg.key.id, msg);
      } else if (msg.message.documentMessage) {
        mediaType = msg.message.documentMessage.mimetype || 'application/octet-stream';
        mediaUrl = msg.key.id;
        pendingMedia.set(msg.key.id, msg);
      }

      const payload = {
        provider: 'baileys',
        id: msg.key.id,
        message_sid: msg.key.id,
        from: `+${fromPhone}`,
        text,
        media_url: mediaUrl,
        media_id: mediaUrl,
        media_content_type: mediaType,
      };

      try {
        await fetch(`${BACKEND_URL}/api/webhook/whatsapp/inbound`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } catch (err) {
        logger.error({ err: err.message }, 'backend webhook forward failed');
      }
    }
  });
}

// ---------------------------------------------------------------------------
// HTTP API
// ---------------------------------------------------------------------------
const app = express();
app.use(express.json({ limit: '5mb' }));

app.post('/wa/send', async (req, res) => {
  const { to, body } = req.body || {};
  if (!to || !body) {
    return res.status(400).json({ error: 'to and body are required' });
  }
  if (!sock || connectionStatus !== 'connected') {
    return res.status(503).json({ error: 'socket not connected', status: connectionStatus });
  }
  const jid = to.includes('@') ? to : `${to.replace('+', '')}@s.whatsapp.net`;
  try {
    const result = await sock.sendMessage(jid, { text: body });
    return res.json({ sid: result.key.id, status: 'sent' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/wa/download', async (req, res) => {
  const mediaId = (req.body && (req.body.media_id || req.body.media_url)) || null;
  if (!mediaId) {
    return res.status(400).json({ error: 'media_id is required' });
  }
  const msg = pendingMedia.get(mediaId);
  if (!msg) {
    return res.status(404).json({ error: 'media not found; expired?' });
  }
  if (!downloadMediaMessage) {
    return res.status(503).json({ error: 'baileys not installed' });
  }
  try {
    const buffer = await downloadMediaMessage(msg, 'buffer', {}, { logger });
    res.set('content-type', 'application/octet-stream');
    return res.send(buffer);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get('/wa/health', (_req, res) => {
  res.json({
    provider: 'baileys',
    status: connectionStatus,
    phone: phoneNumber,
  });
});

// Only start the HTTP server + Baileys socket when this file is run directly.
// When the module is `require()`d (e.g. from unit tests), we just want the
// pure helpers and skip the side effects.
if (require.main === module) {
  app.listen(PORT, () => {
    logger.info({ port: PORT, backend: BACKEND_URL }, 'sidecar HTTP listening');
    startSock().catch((err) => {
      logger.error({ err: err.message }, 'startSock failed');
    });
  });
}

module.exports = {
  shouldSkipSelfMessage,
  shouldSkipStaleMessage,
  SIDECAR_STARTED_AT,
};

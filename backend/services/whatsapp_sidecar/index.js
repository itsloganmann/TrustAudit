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
const qrcode = require('qrcode-terminal');
const pino = require('pino');

let makeWASocket;
let useMultiFileAuthState;
let DisconnectReason;
let downloadMediaMessage;

try {
  const baileys = require('@whiskeysockets/baileys');
  makeWASocket = baileys.default || baileys.makeWASocket;
  useMultiFileAuthState = baileys.useMultiFileAuthState;
  DisconnectReason = baileys.DisconnectReason;
  downloadMediaMessage = baileys.downloadMediaMessage;
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

async function startSock() {
  if (!makeWASocket) {
    logger.warn('baileys unavailable; sidecar running in degraded mode');
    connectionStatus = 'degraded';
    return;
  }
  const { state, saveCreds } = await useMultiFileAuthState('./sessions');
  sock = makeWASocket({ auth: state, printQRInTerminal: false });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      connectionStatus = 'qr_pending';
      qrcode.generate(qr, { small: true });
      logger.info('Scan the QR code above with your WhatsApp mobile app.');
    }
    if (connection === 'open') {
      connectionStatus = 'connected';
      phoneNumber = sock.user && sock.user.id ? sock.user.id.split(':')[0] : null;
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

app.listen(PORT, () => {
  logger.info({ port: PORT, backend: BACKEND_URL }, 'sidecar HTTP listening');
  startSock().catch((err) => {
    logger.error({ err: err.message }, 'startSock failed');
  });
});

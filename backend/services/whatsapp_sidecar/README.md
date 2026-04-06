# WhatsApp Sidecar (Baileys)

A minimal Node.js bridge that connects the TrustAudit Python backend to a
real WhatsApp account using [Baileys](https://github.com/WhiskeySockets/Baileys).

The sidecar runs as a companion process next to the FastAPI backend and
exposes a tiny HTTP API. The Python `BaileysClient` talks to this API — it
never imports Baileys directly.

## Why a sidecar?

- Baileys is Node-only, and we want the Python backend to stay lightweight.
- Each WhatsApp account maps to one sidecar process; scaling is horizontal.
- If the sidecar is down, the Python `BaileysClient.health()` reports
  `"unreachable"` and the backend can fall back to `mock` or `twilio`.

## Install

```bash
cd backend/services/whatsapp_sidecar
npm install
```

Requires Node 18+ because the code uses the built-in global `fetch`.

## Run

```bash
BACKEND_URL=http://localhost:8000 PORT=3001 npm start
```

On first run, the process prints a QR code to the terminal. Scan it with
your phone (WhatsApp -> Settings -> Linked Devices -> Link a Device).

Credentials are persisted to `./sessions/` so subsequent restarts reconnect
automatically.

## HTTP API

| Method | Path            | Body                        | Returns                                            |
| ------ | --------------- | --------------------------- | -------------------------------------------------- |
| POST   | `/wa/send`      | `{ to, body }`              | `{ sid, status }`                                  |
| POST   | `/wa/download`  | `{ media_id }`              | raw bytes (octet-stream)                           |
| GET    | `/wa/health`    | —                           | `{ provider, status, phone }`                      |

`status` is one of `connected`, `qr_pending`, `disconnected`, `degraded`.

## Inbound webhook forwarding

Whenever a new message arrives, the sidecar POSTs JSON to:

```
${BACKEND_URL:-http://localhost:8000}/api/webhook/whatsapp/inbound
```

The payload shape matches what `BaileysClient.parse_inbound` expects:

```json
{
  "provider": "baileys",
  "id": "3EB0…",
  "message_sid": "3EB0…",
  "from": "+919812345678",
  "text": "hello",
  "media_url": "3EB0…",
  "media_id": "3EB0…",
  "media_content_type": "image/jpeg"
}
```

For image/document messages, the backend calls back into `POST /wa/download`
with the `media_id` to fetch the raw bytes.

## Environment variables

| Name         | Default                    | Meaning                                  |
| ------------ | -------------------------- | ---------------------------------------- |
| `PORT`       | `3001`                     | HTTP listen port                         |
| `BACKEND_URL`| `http://localhost:8000`    | TrustAudit FastAPI base URL              |
| `LOG_LEVEL`  | `info`                     | pino log level                           |

## Deploying to Render

The sidecar must run as a separate service. In Render:

1. Create a new Node web service pointing at this directory.
2. Build command: `npm install`
3. Start command: `node index.js`
4. Environment: set `BACKEND_URL` to the internal URL of the Python service.
5. Disk: attach a 1GB persistent disk at `./sessions/` so auth survives restarts.

## Troubleshooting

- **QR code never appears:** delete `./sessions/` and restart.
- **"media not found":** the sidecar keeps an in-memory map of incoming
  media keyed by message id. Large backlogs may evict entries; restart.
- **Messages not arriving:** verify `BACKEND_URL` is reachable from the
  sidecar; test with `curl ${BACKEND_URL}/api/webhook/whatsapp/health`.

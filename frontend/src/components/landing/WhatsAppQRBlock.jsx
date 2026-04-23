import { useState } from "react";
import { QrCode as QrCodeIcon } from "lucide-react";

/**
 * WhatsApp QR block — renders the QR PNG from the backend
 * ``GET /api/demo/qr?text=<wa_link>`` endpoint. The backend uses
 * ``qrcode[pil]`` which is already in the venv for this worker.
 *
 * Props:
 *   waLink     — the wa.me deep link to encode in the QR
 *   size       — pixel size of the rendered QR
 *   label      — small caption beneath
 */
export default function WhatsAppQRBlock({
  waLink,
  size = 180,
  label = "Scan to send proof from any phone",
}) {
  const [errored, setErrored] = useState(false);
  const src = `/api/demo/qr?text=${encodeURIComponent(waLink)}&box_size=8&border=2`;

  return (
    <div className="flex flex-col items-center">
      <div className="relative rounded-2xl p-3 bg-white border border-zinc-200 shadow-sm">
        {errored ? (
          <div
            className="flex flex-col items-center justify-center rounded-xl bg-zinc-50 border border-zinc-200 text-zinc-500 text-[11px] text-center px-4"
            style={{ width: size, height: size }}
          >
            <QrCodeIcon size={28} className="mb-2 opacity-50" />
            QR unavailable.
            <br />
            Use the tap-to-open button.
          </div>
        ) : (
          <img
            src={src}
            alt="WhatsApp QR code"
            width={size}
            height={size}
            className="rounded-xl"
            onError={() => setErrored(true)}
            draggable={false}
          />
        )}
      </div>
      <p className="mt-3 text-[11px] text-zinc-500 font-medium tracking-wide">{label}</p>
    </div>
  );
}

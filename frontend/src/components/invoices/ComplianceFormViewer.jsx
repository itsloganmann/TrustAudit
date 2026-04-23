import { useState } from "react";
import { motion } from "framer-motion";
import {
  FileText,
  Download,
  Printer,
  ExternalLink,
  Loader2,
} from "lucide-react";

/**
 * Embedded PDF preview for the compliance filing form.
 *
 * @param {object} props
 * @param {string|number} props.invoiceId
 * @param {string} [props.className]
 * @param {number} [props.height=520]
 */
export default function ComplianceFormViewer({
  invoiceId,
  className = "",
  height = 520,
}) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);

  if (!invoiceId) return null;

  const pdfUrl = `/api/invoices/${invoiceId}/compliance.pdf`;

  function handlePrint() {
    const win = window.open(pdfUrl, "_blank", "noopener,noreferrer");
    if (win) {
      win.addEventListener("load", () => {
        try {
          win.print();
        } catch {
          /* user can print manually */
        }
      });
    }
  }

  return (
    <div
      className={`rounded-xl bg-white border border-zinc-200 overflow-hidden ${className}`}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-200 bg-zinc-50">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-white border border-zinc-200 flex items-center justify-center">
            <FileText size={11} className="text-zinc-500" />
          </div>
          <p className="text-[10px] text-zinc-700 uppercase tracking-widest font-semibold">
            Compliance Filing
          </p>
        </div>
        <div className="flex items-center gap-1">
          <ToolbarButton
            icon={Download}
            label="Download"
            href={pdfUrl}
            download={`compliance-${invoiceId}.pdf`}
          />
          <ToolbarButton icon={Printer} label="Print" onClick={handlePrint} />
          <ToolbarButton
            icon={ExternalLink}
            label="Open"
            href={pdfUrl}
            target="_blank"
          />
        </div>
      </div>

      {/* Viewer body */}
      <div className="relative bg-zinc-50" style={{ height }}>
        {!loaded && !errored && (
          <div className="absolute inset-0 flex items-center justify-center">
            <motion.div
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="flex flex-col items-center gap-2"
            >
              <Loader2 size={18} className="text-zinc-500 animate-spin" />
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest">
                Loading PDF
              </p>
            </motion.div>
          </div>
        )}

        {errored ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
            <FileText size={20} className="text-zinc-400" />
            <p className="text-[11px] text-zinc-500">Could not load PDF.</p>
            <a
              href={pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="text-[10px] text-emerald-700 hover:underline"
            >
              Open in new tab
            </a>
          </div>
        ) : (
          <iframe
            title={`Compliance form for invoice ${invoiceId}`}
            src={pdfUrl}
            className="absolute inset-0 w-full h-full bg-white"
            onLoad={() => setLoaded(true)}
            onError={() => setErrored(true)}
          />
        )}
      </div>
    </div>
  );
}

function ToolbarButton({ icon: Icon, label, onClick, href, target, download }) {
  const cls =
    "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] text-zinc-600 hover:text-zinc-900 hover:bg-white border border-transparent hover:border-zinc-200 transition-colors";
  if (href) {
    return (
      <a
        href={href}
        target={target}
        rel={target === "_blank" ? "noreferrer" : undefined}
        download={download}
        className={cls}
      >
        <Icon size={11} />
        {label}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      <Icon size={11} />
      {label}
    </button>
  );
}

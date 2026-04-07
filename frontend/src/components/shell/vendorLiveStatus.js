import { createContext, useContext } from "react";

/**
 * Context that exposes the Phase I SSE transport status to children of
 * `VendorShell`. The default value is `"idle"`, which is what consumers
 * outside the shell see — this lets components mounted standalone (e.g. in
 * tests or storybook) fall back gracefully without having to know about the
 * shell.
 *
 * Value is one of `"idle" | "open" | "polling" | "error"`.
 */
export const VendorLiveStatusContext = createContext("idle");

/** React hook returning the current SSE status from the vendor shell. */
export function useVendorLiveStatus() {
  return useContext(VendorLiveStatusContext);
}

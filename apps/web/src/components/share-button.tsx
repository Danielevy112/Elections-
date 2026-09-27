"use client";

import { useState } from "react";

/** Native share sheet includes WhatsApp on supported phones; copy link elsewhere. */
export function ShareButton({ title }: { title: string }) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);
  async function share() {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 3000);
    } catch (error) {
      if ((error as DOMException)?.name !== "AbortError") setFallback(true);
    }
  }
  return <span className="inline-flex flex-wrap items-center gap-2"><button type="button" onClick={share} className="rounded-full bg-ink-pill px-3 py-1.5 text-xs font-medium text-fg hover:bg-ink-row" aria-label={`שתף: ${title}`}>{copied ? "הקישור הועתק" : "שתף"}</button>{fallback ? <span className="max-w-[14rem] break-all text-[10px] text-ink-muted">{typeof window !== "undefined" ? window.location.href : ""}</span> : null}</span>;
}

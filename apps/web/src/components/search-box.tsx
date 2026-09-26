"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { SearchResult } from "@elections26/data";
import { ResultRow, resultHref } from "./search-results";

/**
 * Header search. A plain GET form to /search underneath, so it works before (or without)
 * JavaScript; with it, results appear as you type. Arrow keys move, Enter opens, Escape
 * closes. Requests are debounced and aborted when superseded.
 */
export function SearchBox() {
  const router = useRouter();
  const listId = useId();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const box = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) {
      setResults([]);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: controller.signal });
        if (!res.ok) return setResults([]);
        const body = (await res.json()) as { results: SearchResult[] };
        setResults(body.results.slice(0, 8));
        setActive(-1);
        setOpen(true);
      } catch {
        /* aborted or offline: keep what is shown */
      }
    }, 150);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  function go(r: SearchResult) {
    setOpen(false);
    setQ("");
    router.push(resultHref(r));
  }

  return (
    <form
      ref={box}
      action="/search"
      method="get"
      role="search"
      className="relative w-full"
      onSubmit={(e) => {
        const r = results[active];
        if (open && r) {
          e.preventDefault();
          go(r);
        }
      }}
    >
      <input
        name="q"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onFocus={() => results.length > 0 && setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, results.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, -1));
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        maxLength={40}
        placeholder="חיפוש מועמד/ת או רשימה"
        aria-label="חיפוש מועמד/ת או רשימה"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-controls={listId}
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        autoComplete="off"
        className="w-full rounded-xl bg-ink-card px-3 py-2 text-[13px] outline-none ring-accent placeholder:text-ink-dim focus:ring-2"
      />
      {open && results.length > 0 ? (
        <ul
          id={listId}
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-[70vh] overflow-y-auto rounded-xl border border-ink-line bg-ink-page shadow-xl"
        >
          {results.map((r, i) => (
            <li
              key={`${r.kind}:${r.slug}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              onMouseDown={(e) => {
                e.preventDefault();
                go(r);
              }}
              onMouseEnter={() => setActive(i)}
              className="cursor-pointer border-t border-ink-line/60 first:border-t-0"
            >
              <ResultRow result={r} active={i === active} />
            </li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

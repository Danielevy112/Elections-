"use client";

import { useEffect, useState } from "react";

/** Dark by default; the choice is kept in localStorage and applied before paint (see layout). */
export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => setLight(document.documentElement.dataset.theme === "light"), []);
  return (
    <button
      type="button"
      onClick={() => {
        const next = !light;
        setLight(next);
        if (next) document.documentElement.dataset.theme = "light";
        else delete document.documentElement.dataset.theme;
        try {
          localStorage.setItem("theme", next ? "light" : "dark");
        } catch {}
      }}
      className="rounded-full bg-ink-pill px-3 py-1 text-[11px] font-medium text-ink-muted"
      aria-label={light ? "מצב כהה" : "מצב בהיר"}
    >
      {light ? "כהה" : "בהיר"}
    </button>
  );
}

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export type FetchMode = "live" | "offline";

/**
 * Every upstream read goes through here. In `live` mode the response is written to the
 * fixture directory; in `offline` mode it is replayed from there.
 *
 * This is what makes the project developable without network access to the Israeli
 * government hosts, and it doubles as the regression corpus: once a real sync records a
 * response, its parsing is testable forever without hitting the source again.
 */
export class Fetcher {
  readonly mode: FetchMode;
  private readonly fixtureDir: string;
  private readonly requested: string[] = [];

  constructor(mode: FetchMode, fixtureDir: string) {
    this.mode = mode;
    this.fixtureDir = fixtureDir;
    if (mode === "live") mkdirSync(fixtureDir, { recursive: true });
  }

  /** URLs this fetcher was asked for, in order. Used by the CLI run report. */
  get log(): readonly string[] {
    return this.requested;
  }

  fixturePath(url: string): string {
    const parsed = new URL(url);
    const slug = `${parsed.host}${parsed.pathname}`
      .replace(/[^a-zA-Z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80)
      .toLowerCase();
    const digest = createHash("sha1").update(url).digest("hex").slice(0, 10);
    return join(this.fixtureDir, `${slug}.${digest}.json`);
  }

  async json(url: string): Promise<unknown> {
    this.requested.push(url);
    const path = this.fixturePath(url);

    if (this.mode === "offline") {
      if (!existsSync(path)) {
        throw new Error(
          `No fixture for ${url}\n` +
            `  expected: ${path}\n` +
            `  Record it with a live run (npm run ingest -- --live) from a network that ` +
            `can reach this host.`,
        );
      }
      return JSON.parse(readFileSync(path, "utf8"));
    }

    const response = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "elections26-ingest/0.1" },
    });
    if (!response.ok) {
      throw new Error(`GET ${url} -> ${response.status} ${response.statusText}`);
    }
    const body = await response.text();
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      throw new Error(`GET ${url} returned non-JSON (first 200 chars): ${body.slice(0, 200)}`);
    }
    writeFileSync(path, JSON.stringify(parsed, null, 2) + "\n", "utf8");
    return parsed;
  }
}

/**
 * Knesset OData serialises dates as `/Date(1234567890000)/` or plain ISO strings depending
 * on the entity. Returns a YYYY-MM-DD string, or undefined for anything unparseable — a
 * missing date is recoverable, a wrong one is not.
 */
export function parseODataDate(value: unknown): string | undefined {
  if (typeof value !== "string" || value.length === 0) return undefined;

  const dotNet = /^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/.exec(value);
  if (dotNet) {
    const date = new Date(Number(dotNet[1]));
    return Number.isNaN(date.getTime()) ? undefined : date.toISOString().slice(0, 10);
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString().slice(0, 10);
}

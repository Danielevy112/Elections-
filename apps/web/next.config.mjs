import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Security headers on every response. Everything the site loads is its own: no external
 * scripts, fonts, images or APIs, so the policy can say so outright.
 *
 * script-src keeps 'unsafe-inline' because Next's hydration payload and the theme script
 * are inline, and a nonce would force every page off the CDN into per-request rendering.
 * What guards against injection is that no user input is ever rendered: every string on
 * the site comes from the committed or published dataset, and React escapes all of it.
 * Vercel's preview toolbar (vercel.live) is allowed on preview deployments only.
 */
const preview = process.env.VERCEL_ENV === "preview";
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${preview ? " https://vercel.live" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  `connect-src 'self'${preview ? " https://vercel.live wss://ws-us3.pusher.com" : ""}`,
  `frame-src ${preview ? "https://vercel.live" : "'none'"}`,
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The "@/" alias is declared in tsconfig.json, but relying on Next to read it there has
  // proven environment-dependent: the same commit resolved it locally and failed on Vercel
  // with "Can't resolve '@/components/ui'". Declaring it against this file's own directory
  // removes the ambiguity — it cannot depend on the working directory or on how tsconfig
  // paths are interpreted.
  webpack: (config) => {
    config.resolve.alias = { ...config.resolve.alias, "@": join(here, "src") };
    return config;
  },
  // Workspace packages ship TypeScript source rather than a build artifact, so Next
  // compiles them alongside the app. Keeps the data layer free of a build step.
  transpilePackages: ["@elections26/data", "@elections26/db", "@elections26/schema"],
  // No `output: "export"`. Every page is still prerendered at build time via
  // generateStaticParams, and the data layer is still read from committed snapshots during
  // the build — nothing became dynamic. What changed is that Vercel's Next.js preset now
  // builds and serves this the way it expects, instead of a static export having to be
  // matched up with an Output Directory setting. Six deployments failed on that mismatch.
  images: { unoptimized: true },
  poweredByHeader: false,
  // The share-card routes read the Heebo font files at runtime (on ISR regeneration), so
  // they must ship with those functions.
  outputFileTracingIncludes: { "/**/*": ["./assets/fonts/*"] },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;

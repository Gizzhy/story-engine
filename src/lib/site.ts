// Single source for the production URL used by metadata, robots, and sitemap.
// Override per-environment with NEXT_PUBLIC_SITE_URL; the default is a
// placeholder — set the real Netlify domain (see .env.local / Netlify env).
export const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://transcript-to-script.netlify.app";

export const SITE_NAME = "Story Engine";

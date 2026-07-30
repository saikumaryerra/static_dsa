/**
 * robots.txt — Astro static endpoint (M5 architecture §4.3, spec §14).
 *
 * SPEC-GAP (arch §4.3): served from an endpoint rather than a static
 * `public/robots.txt` so the sitemap URL can template `Astro.site`. This keeps the
 * origin defined in exactly one place (astro.config.mjs); a plain file couldn't.
 * Prerendered to `dist/robots.txt`. Allows all crawlers and points them at the
 * sitemap.
 */
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) => {
  const sitemap = new URL('/sitemap.xml', site).href;

  const body = `User-agent: *
Allow: /

Sitemap: ${sitemap}
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain' },
  });
};

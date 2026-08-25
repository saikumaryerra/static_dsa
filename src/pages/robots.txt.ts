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
import { deploymentUrl } from '../lib/deployment-url';

export const GET: APIRoute = ({ site }) => {
  // D3: joined, not `new URL`, so the pointer survives a sub-path deployment —
  // and `/sitemap.xml` keeps its extension rather than gaining a trailing slash.
  const sitemap = deploymentUrl(site!, '/sitemap.xml');

  const body = `User-agent: *
Allow: /

Sitemap: ${sitemap}
`;

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain' },
  });
};

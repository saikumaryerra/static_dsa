/**
 * The deployment URL and the unstamped-deploy guard (React migration; replaces
 * `tests/unit/rehost.test.ts`, whose guard pins moved here with the guard
 * itself from the retired `astro.config.mjs` to `src/render/site-url.ts`).
 *
 * THE INCIDENT THIS PINS (2026-08-24). The guard listed `CF_PAGES` alone —
 * Cloudflare *Pages* — while this project deploys through Cloudflare *Workers
 * Builds*, which sets `WORKERS_CI`. So the check written to stop an unstamped
 * deploy did not run on the one platform that deploys this site. Each of the
 * four publishing builders is therefore asserted by BEHAVIOUR, not by source
 * text: with the variable set and no `SITE_URL`, the build throws.
 */
import { describe, expect, it } from 'vitest';
import {
  PUBLISHING_BUILDERS,
  resolveSiteUrl,
  SENTINEL,
} from '../../src/render/site-url';

describe('the sentinel', () => {
  it('is a reserved, unresolvable domain (RFC 2606)', () => {
    expect(new URL(SENTINEL).hostname.endsWith('.invalid')).toBe(true);
  });

  it('is the default when SITE_URL is unset (local builds, the CI gate)', () => {
    expect(resolveSiteUrl({})).toBe(SENTINEL);
    expect(resolveSiteUrl({ SITE_URL: '' })).toBe(SENTINEL);
  });

  it('gives way to SITE_URL', () => {
    expect(resolveSiteUrl({ SITE_URL: 'https://learndsa.dev' })).toBe(
      'https://learndsa.dev',
    );
  });
});

describe('the unstamped-deploy guard', () => {
  it('names exactly the four publishing builders', () => {
    expect(PUBLISHING_BUILDERS.map(([key]) => key)).toEqual([
      'CF_PAGES',
      'WORKERS_CI',
      'NETLIFY',
      'VERCEL',
    ]);
  });

  it.each([
    ['CF_PAGES', 'Cloudflare Pages'],
    ['WORKERS_CI', 'Cloudflare Workers Builds'],
    ['NETLIFY', 'Netlify'],
    ['VERCEL', 'Vercel'],
  ])('fails an unstamped build on %s', (variable, label) => {
    expect(() => resolveSiteUrl({ [variable]: '1' })).toThrow(
      `SITE_URL is not set on a ${label} build`,
    );
  });

  it('lets a stamped build on a publishing builder proceed', () => {
    expect(
      resolveSiteUrl({ WORKERS_CI: '1', SITE_URL: 'https://learndsa.dev' }),
    ).toBe('https://learndsa.dev');
  });
});

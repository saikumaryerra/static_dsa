/**
 * JSON-LD structured-data helpers (M5 architecture §3, spec §14).
 *
 * Pure, dependency-free serializers that produce build-time JSON-LD strings for
 * `<script type="application/ld+json" ...>` blocks. They emit static text only —
 * no client JS. The serialized `<` is escaped to `<` so a value that happens
 * to contain "</script>" can never break out of the inline script (XSS-safe
 * embedding, arch §3.1). Kept side-effect-free so they are trivially unit-testable.
 */
import type { CollectionEntry } from 'astro:content';

/**
 * Serialize a value to a JSON-LD string safe to inline in a `<script>` element.
 *
 * Escapes every `<` as its `<` unicode form — the only character that can
 * terminate a script element early — while leaving the JSON otherwise intact.
 *
 * @param data - Any JSON-serializable structured-data object.
 * @returns A JSON string with `<` neutralized for inline embedding.
 */
function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * Build the `Course` JSON-LD for a lesson page (arch §3.1).
 *
 * Omits `hasCourseInstance` deliberately — a free, static, self-paced lesson has
 * no schedule or instructor (arch §3.1 SPEC-GAP); the shape stays valid schema.org.
 *
 * @param entry   - The published lesson collection entry.
 * @param siteUrl - The absolute site origin (from `Astro.site`), used to build the
 *                  canonical course URL and the provider URL.
 * @returns An inline-safe JSON-LD string describing the lesson as a `Course`.
 */
export function courseJsonLd(
  entry: CollectionEntry<'lessons'>,
  siteUrl: string | URL,
): string {
  const origin = new URL(siteUrl).origin;
  const url = new URL(`/learn/${entry.data.slug}`, siteUrl).href;

  return serializeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Course',
    name: entry.data.title,
    description: entry.data.summary,
    url,
    inLanguage: 'en',
    isAccessibleForFree: true,
    educationalLevel: entry.data.difficulty,
    keywords: entry.data.tags.join(', '),
    provider: {
      '@type': 'Organization',
      name: 'LearnDSA',
      url: origin,
    },
  });
}

/**
 * Build the optional site-level `WebSite` JSON-LD for the home page (arch §3.3).
 *
 * @param siteUrl - The absolute site origin (from `Astro.site`).
 * @returns An inline-safe JSON-LD string describing the site as a `WebSite`.
 */
export function webSiteJsonLd(siteUrl: string | URL): string {
  const origin = new URL(siteUrl).origin;

  return serializeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'LearnDSA',
    description:
      'Free, interactive lessons on data structures and algorithms with step-through visualizations.',
    url: origin,
    inLanguage: 'en',
  });
}

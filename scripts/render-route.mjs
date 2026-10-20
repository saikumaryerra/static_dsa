/**
 * render-route.mjs — `npm run render -- <url> [out.html]`: one route through
 * the dev SSR renderer, for parity diffs without a full build (React
 * migration, plan §2.1). Pair it with the inventory's page diff:
 *
 *   npm run render -- /learn/arrays/ /tmp/arrays.html
 *   node scripts/migration/inventory.mjs --diff-page /learn/arrays/ \
 *     --against .migration/baseline-dist --file /tmp/arrays.html --prose
 *
 * Starts Vite in middleware mode (no port is bound), loads
 * `src/entry-server.tsx` with `ssrLoadModule`, renders the page with the dev
 * asset URLs and writes the HTML to `out.html`, or to stdout without one.
 */
import { writeFileSync } from 'node:fs';
import process from 'node:process';
import { createServer } from 'vite';

const [url, out] = process.argv.slice(2);
if (!url) {
  process.stderr.write('usage: npm run render -- <url> [out.html]\n');
  process.exit(2);
}

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom',
  logLevel: 'error',
});
try {
  const entry = await server.ssrLoadModule('/src/entry-server.tsx');
  await entry.init();
  const route = entry
    .routes()
    .find((/** @type {{ path: string }} */ r) => r.path === url);
  if (!route) throw new Error(`no route at ${url} (page paths end in "/")`);
  const text =
    route.kind === 'file'
      ? route.body(entry.siteUrl())
      : entry.render(url, {
          stylesheet: '/src/styles/site.css',
          module: (/** @type {string} */ name) =>
            `/src/client/modules/${name}.ts`,
          islands: '/src/client/islands.ts',
        }).html;
  if (out) writeFileSync(out, text);
  else process.stdout.write(text);
} finally {
  await server.close();
}

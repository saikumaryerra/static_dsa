/**
 * The build (React migration, D-03 / plan §2.1). `vite build` is one command
 * that runs three steps through `builder.buildApp`:
 *
 * 1. the CLIENT environment — the island bootstrap, one entry per client
 *    module and the site stylesheet → `dist/assets/` (+ Vite's manifest);
 * 2. the SSR environment — `src/entry-server.tsx`, the route table and every
 *    compiled lesson → `.build/server/entry-server.js` (never deployed);
 * 3. the prerender (`scripts/vite-plugin-ssg.ts`) — every route to static
 *    HTML in `dist/`, plus `.build/page-manifest.json`.
 *
 * `npm run dev` serves the same renderer as middleware (`ssg()`). MDX is only
 * ever imported by the SSR entry, never by client code, so no lesson ships as
 * JavaScript. `appType: 'custom'`: no SPA fallback — an unknown URL is a 404
 * here exactly as on the host.
 */
import { fileURLToPath } from 'node:url';
import mdx from '@mdx-js/rollup';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import {
  moduleEntries,
  outPaths,
  prerender,
  SOURCES,
  ssg,
} from './scripts/vite-plugin-ssg';
import { mdxOptions } from './src/mdx/pipeline';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const { outDist, outBuild } = outPaths(ROOT);

export default defineConfig({
  root: ROOT,
  appType: 'custom',
  plugins: [
    // @mdx-js/rollup: compiles the lessons with Astro's remark/rehype chain
    // (src/mdx/pipeline.ts). `pre`, so React's JSX transform sees its output.
    { enforce: 'pre', ...mdx(mdxOptions) },
    // @vitejs/plugin-react: JSX for .tsx and the compiled .mdx; Fast Refresh in dev.
    react({ include: /\.(tsx|mdx)$/ }),
    // @tailwindcss/vite: Tailwind v4 for the site stylesheet (unchanged from Astro).
    tailwindcss(),
    ssg(),
  ],
  build: {
    outDir: outDist,
    assetsDir: 'assets',
    manifest: true,
    emptyOutDir: true,
  },
  environments: {
    client: {
      build: {
        outDir: outDist,
        manifest: true,
        rolldownOptions: {
          input: {
            islands: SOURCES.islands,
            site: SOURCES.stylesheet,
            ...moduleEntries(ROOT),
          },
        },
      },
    },
    ssr: {
      build: {
        outDir: `${outBuild}/server`,
        emptyOutDir: true,
        manifest: false,
        copyPublicDir: false,
        ssr: SOURCES.entryServer,
        rolldownOptions: {
          output: { entryFileNames: 'entry-server.js' },
        },
      },
    },
  },
  builder: {
    async buildApp(builder) {
      await builder.build(builder.environments.client);
      await builder.build(builder.environments.ssr);
      await prerender({ root: ROOT, outDist, outBuild });
    },
  },
});

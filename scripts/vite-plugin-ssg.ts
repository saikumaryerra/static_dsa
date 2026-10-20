/**
 * The in-repo static-site generator (React migration, D-03): ~the 400 lines of
 * build code option (a) of the decision record buys instead of a framework.
 *
 * Three jobs:
 *
 * 1. `ssgResolver()` — the TEMPORARY `.astro` → `.tsx` resolver (D-08). The 127
 *    lessons keep importing `../../components/X.astro` until the P5 codemod;
 *    an import of `X.astro` from an `.mdx` file resolves to the sibling
 *    `X.tsx`, and the build fails, naming the lesson, when that file does not
 *    exist. `enforce: 'pre'` because Vite's own resolver would otherwise find
 *    the `.astro` file first.
 * 2. `ssg()` — the dev middleware: every route rendered on request through the
 *    SSR entry (`server.ssrLoadModule`), the same renderer the build uses.
 *    Unknown paths, slashless page paths included, get the 404 page with a 404
 *    status, as in production.
 * 3. `prerender()` — called from `vite.config.ts`'s `builder.buildApp` after
 *    the client and SSR builds: imports `.build/server/entry-server.js`,
 *    renders every route into `dist/`, writes `.build/page-manifest.json` (the
 *    per-page chunk lists the JS budget reads, D-06) and moves Vite's manifest
 *    out of `dist/` so no build metadata is deployed.
 *
 * OUTPUT LOCATION (plan §2.1): `LDSA_OUT=/tmp/ws npm run build` writes
 * `/tmp/ws/dist` and `/tmp/ws/.build`; unset, both sit at the repository root.
 * Build metadata always lives in the `.build/` SIBLING of the `dist/` it
 * describes — the rule `verify-dist.mjs` and `js-budget.spec.ts` rely on.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import type { Connect, Manifest, Plugin, ViteDevServer } from 'vite';

/** What `src/entry-server.tsx` exports, as far as this file calls it. */
interface PageAssets {
  stylesheet: string;
  module(name: string): string;
  islands: string;
}
interface RenderedPage {
  html: string;
  islands: string[];
  islandAssets: Record<string, string[]>;
  modules: string[];
}
type RouteDef =
  | { kind: 'page'; path: string }
  | {
      kind: 'file';
      path: string;
      contentType: string;
      body: (site: string) => string;
    };
interface EntryServer {
  init(): Promise<void>;
  routes(): RouteDef[];
  render(path: string, assets: PageAssets): RenderedPage;
  siteUrl(): string;
  outputFile(path: string): string;
  NOT_FOUND_PATH: string;
}

/** Repository-relative source paths the build is wired to. */
export const SOURCES = {
  entryServer: 'src/entry-server.tsx',
  islands: 'src/client/islands.ts',
  stylesheet: 'src/styles/site.css',
  modulesDir: 'src/client/modules',
} as const;

/**
 * Where this build writes: `dist/` and its `.build/` sibling.
 *
 * @param root - Repository root.
 * @param env - The environment (`LDSA_OUT`).
 * @returns Absolute `outDist` and `outBuild`.
 */
export function outPaths(
  root: string,
  env: NodeJS.ProcessEnv = process.env,
): { outDist: string; outBuild: string } {
  const base = env.LDSA_OUT ? path.resolve(root, env.LDSA_OUT) : root;
  return {
    outDist: path.join(base, 'dist'),
    outBuild: path.join(base, '.build'),
  };
}

/**
 * One client entry per `src/client/modules/*.ts` (each page loads only the
 * modules its components ask for, D-05).
 *
 * @param root - Repository root.
 * @returns Rollup input entries, keyed by module name.
 */
export function moduleEntries(root: string): Record<string, string> {
  const dir = path.join(root, SOURCES.modulesDir);
  if (!existsSync(dir)) return {};
  return Object.fromEntries(
    readdirSync(dir)
      .filter((file) => file.endsWith('.ts') && !file.endsWith('.d.ts'))
      .sort()
      .map((file) => [file.slice(0, -'.ts'.length), path.join(dir, file)]),
  );
}

/**
 * The temporary `.astro` → `.tsx` resolver for MDX importers (D-08). Deleted
 * at P5 with the codemod that rewrites the 356 import lines.
 *
 * @returns A pre-enforced Vite plugin.
 */
export function ssgResolver(): Plugin {
  return {
    name: 'ldsa:astro-to-tsx',
    enforce: 'pre',
    resolveId(source, importer) {
      if (
        !importer ||
        !importer.endsWith('.mdx') ||
        !source.endsWith('.astro')
      ) {
        return null;
      }
      const target = path.resolve(
        path.dirname(importer),
        `${source.slice(0, -'.astro'.length)}.tsx`,
      );
      if (!existsSync(target)) {
        this.error(
          `${path.relative(process.cwd(), importer)} imports "${source}", but ${path.relative(process.cwd(), target)} does not exist. Port the component (or add its stub) before building.`,
        );
      }
      return target;
    },
  };
}

/** Asset URLs in dev: Vite serves the sources directly. */
const DEV_ASSETS: PageAssets = {
  stylesheet: `/${SOURCES.stylesheet}`,
  module: (name) => `/${SOURCES.modulesDir}/${name}.ts`,
  islands: `/${SOURCES.islands}`,
};

/**
 * Whether a path names a file with an extension other than `.html` — an asset
 * request that should fall through to Vite rather than get the 404 page.
 *
 * @param pathname - Request path.
 * @returns `true` for `/x.png`, `false` for `/x/`, `/x` and `/404.html`.
 */
function isAssetPath(pathname: string): boolean {
  const last = pathname.slice(pathname.lastIndexOf('/') + 1);
  return last.includes('.') && !last.endsWith('.html');
}

/**
 * The dev renderer: every route through the SSR entry, on request.
 *
 * @returns The Vite plugin.
 */
export function ssg(): Plugin {
  return {
    name: 'ldsa:ssg',
    configureServer(server: ViteDevServer) {
      const handler: Connect.NextHandleFunction = (req, res, next) => {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          next();
          return;
        }
        let pathname: string;
        try {
          pathname = decodeURIComponent(
            new URL(req.url ?? '/', 'http://dev.invalid').pathname,
          );
        } catch {
          res.statusCode = 400;
          res.end();
          return;
        }
        void (async () => {
          const entry = (await server.ssrLoadModule(
            `/${SOURCES.entryServer}`,
          )) as EntryServer;
          await entry.init();
          const route = entry.routes().find((r) => r.path === pathname);
          if (route?.kind === 'file') {
            res.setHeader(
              'Content-Type',
              `${route.contentType}; charset=utf-8`,
            );
            res.end(route.body(entry.siteUrl()));
            return;
          }
          if (!route && isAssetPath(pathname)) {
            next();
            return;
          }
          const page = entry.render(
            route?.path ?? entry.NOT_FOUND_PATH,
            DEV_ASSETS,
          );
          const html = await server.transformIndexHtml(
            req.originalUrl ?? pathname,
            page.html,
          );
          res.statusCode = route ? 200 : 404;
          res.setHeader('Content-Type', 'text/html; charset=utf-8');
          res.end(html);
        })().catch((error: unknown) => {
          if (error instanceof Error) server.ssrFixStacktrace(error);
          next(error);
        });
      };
      // Returned, so it runs AFTER Vite's own middlewares: sources, `/public`
      // and HMR are served first, and only what Vite does not serve reaches the
      // page renderer.
      return () => {
        server.middlewares.use(handler);
      };
    },
  };
}

/**
 * The static-import closure of a manifest entry, as output file names.
 *
 * @param manifest - Vite's client manifest.
 * @param key - Manifest key (a source path or a virtual id).
 * @param seen - Keys already visited.
 * @returns `dist/`-relative files, the entry's own first.
 */
function closure(
  manifest: Manifest,
  key: string,
  seen = new Set<string>(),
): string[] {
  if (seen.has(key)) return [];
  seen.add(key);
  const chunk = manifest[key];
  if (!chunk)
    throw new Error(`prerender: "${key}" is not in the client manifest.`);
  return [
    chunk.file,
    ...(chunk.imports ?? []).flatMap((child) => closure(manifest, child, seen)),
  ];
}

/**
 * The manifest key of a chunk by the tail of its source path.
 *
 * @param manifest - Vite's client manifest.
 * @param suffix - e.g. `/VisualizerIsland.tsx`, `react-dom/client.js`.
 * @returns The key.
 * @throws When no chunk matches.
 */
function keyEndingWith(manifest: Manifest, suffix: string): string {
  const key = Object.keys(manifest).find((candidate) =>
    candidate.endsWith(suffix),
  );
  if (!key) throw new Error(`prerender: no client chunk for "${suffix}".`);
  return key;
}

/**
 * `final-run` → `FinalRun`.
 *
 * @param name - Kebab-case island name.
 * @returns PascalCase.
 */
const pascal = (name: string): string =>
  name.replace(/(^|-)([a-z])/g, (_match, _dash: string, letter: string) =>
    letter.toUpperCase(),
  );

/** Options of `prerender`. */
export interface PrerenderOptions {
  /** Repository root (where `node_modules/` is). */
  root: string;
  outDist: string;
  outBuild: string;
}

/**
 * Render every route into `dist/` and write the page manifest.
 *
 * @param options - Root and output directories.
 * @returns The number of HTML files written.
 */
export async function prerender({
  root,
  outDist,
  outBuild,
}: PrerenderOptions): Promise<number> {
  // The SSR bundle imports its externals (react, shiki, zod) by bare
  // specifier. When `LDSA_OUT` puts it outside the repository, Node's lookup
  // walks up from `.build/server/` and would never reach the repository's
  // `node_modules/`, so a link is planted beside it. `type: module` likewise:
  // the bundle is ESM and there may be no package.json above it.
  writeFileSync(path.join(outBuild, 'package.json'), '{ "type": "module" }\n');
  const modulesLink = path.join(outBuild, 'node_modules');
  if (!path.resolve(outBuild).startsWith(path.resolve(root) + path.sep)) {
    if (!existsSync(modulesLink)) {
      symlinkSync(path.join(root, 'node_modules'), modulesLink, 'dir');
    }
  }

  const serverEntry = path.join(outBuild, 'server', 'entry-server.js');
  const entry = (await import(pathToFileURL(serverEntry).href)) as EntryServer;
  await entry.init();

  const viteManifest = path.join(outDist, '.vite', 'manifest.json');
  const manifest = JSON.parse(readFileSync(viteManifest, 'utf8')) as Manifest;
  const fileOf = (source: string): string => {
    const chunk = manifest[source];
    if (!chunk) throw new Error(`prerender: "${source}" was not built.`);
    return `/${chunk.file}`;
  };
  const assets: PageAssets = {
    stylesheet: fileOf(SOURCES.stylesheet),
    module: (name) => fileOf(`${SOURCES.modulesDir}/${name}.ts`),
    islands: fileOf(SOURCES.islands),
  };

  const site = entry.siteUrl();
  const pages: Record<
    string,
    { eager: string[]; islands: Record<string, string[]>; viz: string[] }
  > = {};
  let htmlFiles = 0;
  for (const route of entry.routes()) {
    const file = path.join(outDist, entry.outputFile(route.path));
    mkdirSync(path.dirname(file), { recursive: true });
    if (route.kind === 'file') {
      writeFileSync(file, route.body(site));
      continue;
    }
    const page = entry.render(route.path, assets);
    writeFileSync(file, page.html);
    htmlFiles += 1;

    const eager = [
      ...new Set([
        ...page.modules.flatMap((name) =>
          closure(manifest, `${SOURCES.modulesDir}/${name}.ts`),
        ),
        ...(page.islands.length > 0 ? closure(manifest, SOURCES.islands) : []),
      ]),
    ];
    const islands: Record<string, string[]> = {};
    const viz = new Set<string>();
    for (const name of page.islands) {
      const files = new Set([
        ...closure(manifest, keyEndingWith(manifest, 'react-dom/client.js')),
        ...closure(
          manifest,
          keyEndingWith(manifest, `/${pascal(name)}Island.tsx`),
        ),
      ]);
      islands[name] = [...files].filter((f) => !eager.includes(f));
      for (const source of page.islandAssets[name] ?? []) {
        for (const f of closure(manifest, source)) {
          if (!eager.includes(f) && !files.has(f)) viz.add(f);
        }
      }
    }
    pages[entry.outputFile(route.path)] = { eager, islands, viz: [...viz] };
  }

  // No build metadata is deployed (D-13): Vite's manifest moves to `.build/`.
  renameSync(viteManifest, path.join(outBuild, 'client-manifest.json'));
  rmSync(path.join(outDist, '.vite'), { recursive: true, force: true });
  writeFileSync(
    path.join(outBuild, 'page-manifest.json'),
    `${JSON.stringify({ pages }, null, 1)}\n`,
  );
  return htmlFiles;
}

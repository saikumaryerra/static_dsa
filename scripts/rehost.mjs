/**
 * rehost.mjs — stamp a built `dist/` with the URL it will actually be served at
 * (Plan D stage D3, plan §4.3).
 *
 *   npm run build                                 # sentinel artifact, portable
 *   npm run rehost https://sample.com/learndsa    # metadata + the 404's base
 *   npm run rehost https://learndsa.dev           # same dist/, root deployment
 *
 * ── WHY A SEPARATE COMMAND ───────────────────────────────────────────────────
 * Cloudflare, Netlify and Vercel run `npm run build` with `SITE_URL` set, so
 * Astro emits correct metadata and there is nothing to stamp. A host with no
 * build step — nginx, an S3 bucket, a GitHub Pages push, an offline copy — has
 * no such hook, and its operator has one artifact and a URL. This is that
 * command: it re-points the artifact without a rebuild and without a toolchain.
 *
 * ── WHAT IT TOUCHES, AND WHY THAT IS EXACTLY THE METADATA ────────────────────
 * Two classes of URL, and only one of them is in scope (plan §4.1):
 *
 * - **Navigational** URLs — links, scripts, styles, fonts — were made
 *   document-relative by `scripts/portablize.mjs` during the build. They carry
 *   NO origin, they are already correct at any origin and any sub-path, and this
 *   script must not touch them. It cannot, either: the only edit below is
 *   "replace the sentinel ORIGIN", and the sentinel can enter the artifact by
 *   exactly one route — `Astro.site`, which feeds declared URLs alone. A
 *   whole-file replace is therefore surgical by construction rather than by
 *   care, and the post-conditions below prove it rather than assuming it.
 * - **Declared** URLs — canonical, `og:url`, `og:image`, `twitter:image`,
 *   sitemap `<loc>`, robots' `Sitemap:` line, JSON-LD `url` — must be absolute
 *   (the sitemap protocol and the OG scrapers both require it), so they are what
 *   gets stamped.
 *
 * Plus the one carve-out: `dist/404.html` keeps root-absolute links (plan §4.4,
 * a 404 is served at the URL the reader typed, so a relative link on it resolves
 * against an arbitrary path), and those links get the deployment's base path
 * prefixed here — through `prefixRootAbsolute`, which lives in `portablize.mjs`
 * beside the carve-out itself and is called by BOTH stamping paths. A build that
 * already knows its sub-path applies it during `npm run build`; this command
 * applies it to a sentinel artifact stamped afterwards. On GitHub Pages, where
 * `404.html` answers every unmatched path under the repo, that prefix is the
 * whole difference between a usable 404 and one whose every link leaves the site.
 *
 * ── IT REFUSES TO RUN TWICE, AND IT REFUSES A HALF-RUN ───────────────────────
 * The 404 prefixing is INCREMENTAL — `/about/` → `/learndsa/about/` → a second
 * run would produce `/learndsa/learndsa/about/`. Rather than track the base it
 * last applied, the script requires the artifact to be in its unstamped state.
 *
 * "Unstamped" is checked file by file rather than as one total, because the two
 * failure modes are different and only one of them is a mistake:
 *
 * - NO file carries the sentinel → already stamped, or built with `SITE_URL`
 *   set. Nothing to do; the message says what the artifact currently names.
 * - SOME do and some do not → a previous run of THIS command died between two
 *   writes (an unwritable file, a full disk, a Ctrl-C). A total would read
 *   "sentinels remain, carry on" and re-prefix every file that was already
 *   written — the exact corruption above, reported as a success, and invisible
 *   to the post-conditions, which read declared URLs and find those correct.
 *
 * Both are checked BEFORE the first byte is written; every write is then atomic
 * (temp file + rename), so no file is ever caught half-written and the two
 * states above are the only two an interrupted run can leave behind.
 */
import {
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, relative, sep } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  basePathOf,
  canonicalHrefs,
  NOT_A_PAGE,
  prefixRootAbsolute,
} from './portablize.mjs';

/* global URL -- Node has had a global WHATWG URL since 10; ESLint's `js.configs
   .recommended` env has no opinion about Node globals, and the sibling scripts
   declare theirs the same way. */

/**
 * The origin an unstamped build carries.
 *
 * MUST equal `SENTINEL` in `astro.config.mjs`; `tests/unit/rehost.test.ts`
 * asserts the two literals against each other, because a silent disagreement
 * would mean this script finds nothing to stamp on a perfectly normal build.
 * `.invalid` is RFC 2606-reserved and can never resolve, so a leaked sentinel is
 * unmistakable in a grep and inert in the wild.
 */
export const SENTINEL = 'https://learndsa.invalid';

/** Files that are not text and are never read (everything else is swept). */
const BINARY = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'ico',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'pdf',
  'zip',
  'mp4',
  'webm',
]);

/** The files whose METADATA is stamped — everything else is only asserted over. */
const STAMPED = (name) =>
  name.endsWith('.html') || name === 'sitemap.xml' || name === 'robots.txt';

/**
 * The declared-URL positions in a built page, each as a tag matcher.
 *
 * Read AFTER the stamp to prove it landed. Kept as tag-level regexes rather than
 * one loose `https?://` sweep so the check cannot be satisfied — or tripped — by
 * `https://schema.org` in a JSON-LD `@context` or an SVG `xmlns`.
 *
 * The canonical is deliberately NOT in this table: it comes from
 * `canonicalHrefs` in `portablize.mjs`, which is what the build reads the
 * deployment's base path out of. One definition of "a canonical", so the pass
 * that writes the 404's base path and the check that proves this stamp landed
 * cannot disagree about which tag they mean.
 */
const DECLARED = [
  {
    what: 'og:url',
    tag: /<meta\b[^>]*\bproperty=(["'])og:url\1[^>]*>/gi,
    attribute: 'content',
  },
  {
    what: 'og:image',
    tag: /<meta\b[^>]*\bproperty=(["'])og:image\1[^>]*>/gi,
    attribute: 'content',
  },
  {
    what: 'twitter:image',
    tag: /<meta\b[^>]*\bname=(["'])twitter:image\1[^>]*>/gi,
    attribute: 'content',
  },
];

/** A JSON-LD block, body captured. */
const LD_JSON = /<script\b[^>]*\bld\+json[^>]*>([\s\S]*?)<\/script\s*>/gi;

/**
 * Split a deployment URL into the origin+base-path string every declared URL
 * must start with.
 *
 * @param {string} raw - The full deployment URL, sub-path included.
 * @returns {{ deployment: string, origin: string, basePath: string }} The
 *   stamped prefix, its origin, and the base path with NO trailing slash (`''`
 *   at a root deployment) — the shape the 404's link prefixing needs.
 * @throws If the value is not an absolute http(s) URL, or carries a query or a
 *   fragment: a deployment is a place, not a request.
 */
export function parseDeployment(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(
      `"${raw}" is not an absolute URL. Pass the FULL deployment URL including any sub-path, e.g. https://sample.com/learndsa`,
    );
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`"${raw}" is not an http(s) URL.`);
  }
  if (url.search !== '' || url.hash !== '') {
    throw new Error(
      `"${raw}" carries a query or fragment. A canonical names a page, not a request for one.`,
    );
  }
  // The same derivation the build uses on its own canonical, imported rather
  // than repeated: a disagreement here would mean the 404 gets one base path at
  // build time and a different one from this command.
  const basePath = basePathOf(url);
  return {
    deployment: `${url.origin}${basePath}`,
    origin: url.origin,
    basePath,
  };
}

/**
 * Replace the sentinel origin with the deployment prefix.
 *
 * The path that FOLLOWS the origin is left exactly as built: `deploymentUrl`
 * (src/lib/deployment-url.ts) already normalized it at build time, so this
 * script never re-implements the join and the two can never disagree about a
 * trailing slash.
 *
 * @param {string} text - File contents.
 * @param {string} deployment - The prefix from {@link parseDeployment}.
 * @returns {{ text: string, changed: number }}
 */
export function stampSentinel(text, deployment) {
  const parts = text.split(SENTINEL);
  return { text: parts.join(deployment), changed: parts.length - 1 };
}

/** How many sentinel origins a file still contains. @param {string} text */
export function countSentinels(text) {
  return text.split(SENTINEL).length - 1;
}

/**
 * Whether a built artifact is unstamped, stamped, or CAUGHT HALFWAY.
 *
 * The stamp is all-or-nothing by construction: every file it touches carries at
 * least one sentinel before it runs — measured on a real build, 5 in
 * `index.html`, 4 in every other page, 19 in `sitemap.xml`, 1 in `robots.txt`,
 * 135 in total — and none after. A MIXTURE is therefore not a state any build
 * produces; it is a run of this command that died between two writes.
 *
 * That distinction is the whole reason this is a function rather than a total.
 * "Zero sentinels anywhere" cannot see a half-stamped artifact, so the
 * operator's natural fix-and-re-run would sail through the refusal and prefix
 * `404.html`'s links a SECOND time (`/learndsa/learndsa/about/`) — corruption
 * reported as success, and invisible to the post-conditions, which read declared
 * URLs and find every one of them correct.
 *
 * @param {{ name: string, sentinels: number }[]} files - Every file the stamp
 *   would touch (pages, `sitemap.xml`, `robots.txt`), with its sentinel count.
 * @returns {'unstamped' | 'stamped' | 'partial'} `'stamped'` for an empty list —
 *   nothing to stamp is nothing to do, and `main` has already refused a `dist/`
 *   that does not exist.
 */
export function stampState(files) {
  const carrying = files.filter((file) => file.sentinels > 0);
  if (carrying.length === 0) return 'stamped';
  return carrying.length === files.length ? 'unstamped' : 'partial';
}

/**
 * Every declared URL in a built page: the four metadata tags plus every `url`
 * field at any depth of its JSON-LD.
 *
 * Walking the parsed JSON-LD by KEY NAME is what keeps `@context:
 * https://schema.org` out of the result without an allowlist to maintain.
 *
 * @param {string} html - The document.
 * @returns {{ what: string, url: string }[]}
 */
export function declaredUrlsInPage(html) {
  /** @type {{ what: string, url: string }[]} */
  const found = [];
  for (const url of canonicalHrefs(html))
    found.push({ what: 'canonical', url });
  for (const { what, tag, attribute } of DECLARED) {
    const matcher = new RegExp(tag.source, tag.flags);
    for (const match of html.matchAll(matcher)) {
      const value = new RegExp(
        `(?<![\\w:-])${attribute}\\s*=\\s*("([^"]*)"|'([^']*)')`,
        'i',
      ).exec(match[0]);
      const url = value?.[2] ?? value?.[3];
      if (url !== undefined) found.push({ what, url });
    }
  }
  for (const block of html.matchAll(LD_JSON)) {
    /** @type {unknown} */
    let data;
    try {
      data = JSON.parse(block[1] ?? '');
    } catch {
      continue; // not our JSON-LD; the build's own tests own its validity
    }
    const walk = (node) => {
      if (Array.isArray(node)) return node.forEach(walk);
      if (node === null || typeof node !== 'object') return;
      for (const [key, value] of Object.entries(node)) {
        if (key === 'url' && typeof value === 'string') {
          found.push({ what: 'json-ld url', url: value });
        } else walk(value);
      }
    };
    walk(data);
  }
  return found;
}

/** Every file under `dir`, recursively, as absolute paths. */
function walkFiles(dir) {
  /** @type {string[]} */
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    out.push(...(statSync(path).isDirectory() ? walkFiles(path) : [path]));
  }
  return out;
}

/**
 * Replaces a file's contents in one indivisible step.
 *
 * `writeFileSync` truncates and then writes, so a run that dies mid-write leaves
 * a TORN file — the one state {@link stampState} could not classify, since a
 * half-written page can carry both a stamped URL and a surviving sentinel.
 * Writing beside the target and renaming over it is atomic on any POSIX
 * filesystem, which is what makes "some files written, the rest untouched" the
 * only shape an interrupted stamp can leave.
 *
 * @param {string} file - The file to replace.
 * @param {string} contents - Its new contents.
 */
function writeAtomic(file, contents) {
  // The temp file goes in the TARGET's directory: `rename` is only atomic within
  // one filesystem, and an OS temp dir is routinely a different one.
  const temporary = `${file}.rehost-tmp`;
  try {
    writeFileSync(temporary, contents);
    renameSync(temporary, file);
  } catch (error) {
    // A stray temp file would be served by the host and swept by the next run's
    // post-conditions, so it does not outlive the failure that produced it.
    try {
      unlinkSync(temporary);
    } catch {
      // Nothing to remove — the first write never got that far.
    }
    throw error;
  }
}

/** Writes one line to stdout — `no-console` is an absolute ban in this repo. */
const say = (line) => process.stdout.write(`${line}\n`);

/**
 * Fails the run.
 *
 * @param {string} headline - What broke.
 * @param {string[]} detail - Offending values.
 * @returns {never}
 */
function fail(headline, detail = []) {
  process.stderr.write(`\nrehost: ${headline}\n`);
  for (const line of detail.slice(0, 20)) process.stderr.write(`  ${line}\n`);
  if (detail.length > 20) {
    process.stderr.write(`  …and ${detail.length - 20} more\n`);
  }
  process.exit(1);
}

/** Stamps `dist/` with the deployment URL given on the command line. */
function main() {
  const [, , raw, ...extra] = process.argv;
  if (raw === undefined || extra.length > 0) {
    fail(
      'usage: npm run rehost <deployment-url>\n  One argument: the FULL URL the artifact will be served at, sub-path included.\n  e.g. npm run rehost https://sample.com/learndsa\n       npm run rehost https://learndsa.dev',
    );
  }
  /** @type {{ deployment: string, origin: string, basePath: string }} */
  let target;
  try {
    target = parseDeployment(raw);
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
    throw error; // unreachable; `fail` exits. Keeps `target` definitely-assigned.
  }

  const dist = fileURLToPath(new URL('../dist', import.meta.url));
  let files;
  try {
    files = walkFiles(dist);
  } catch {
    fail(
      `no dist/ at ${dist}. Build first: npm run build, then npm run rehost ${raw}`,
    );
    throw new Error('unreachable');
  }
  const distRelative = (file) => relative(dist, file).split(sep).join('/');
  const text = files.filter(
    (file) => !BINARY.has(file.slice(file.lastIndexOf('.') + 1).toLowerCase()),
  );

  // ── 1. Precondition: the artifact is unstamped, and wholly so ──────────────
  // Read everything before writing anything, so a refusal is a no-op.
  const contents = new Map(
    text.map((file) => [file, readFileSync(file, 'utf8')]),
  );
  /** Every file the stamp would touch, with what it still carries. */
  const stampable = [...contents]
    .map(([file, source]) => ({
      name: distRelative(file),
      sentinels: countSentinels(source),
    }))
    .filter((file) => STAMPED(file.name));
  const state = stampState(stampable);
  if (state === 'stamped') {
    // What the artifact currently says about itself, so the operator can tell
    // "already correct" from "built for somewhere else" without a grep.
    const declared =
      canonicalHrefs(contents.get(join(dist, 'index.html')) ?? '')[0] ??
      'a real deployment';
    fail(
      `dist/ carries no ${SENTINEL} — it already names ${declared}, having been built with SITE_URL set or rehosted before. There is nothing here to stamp: a sentinel replace has nothing to match, and ${NOT_A_PAGE}'s links have had their base path applied already, so running again would give them a SECOND one (/learndsa/learndsa/about/). If that URL is the deployment, this artifact is ready to ship; otherwise rebuild — it is deterministic — and stamp the fresh one:\n\n    npm run build && npm run rehost ${raw}`,
    );
  }
  if (state === 'partial') {
    const written = stampable.filter((file) => file.sentinels === 0);
    fail(
      `dist/ is HALF STAMPED: ${written.length} of ${stampable.length} files have been written and ${stampable.length - written.length} still carry ${SENTINEL}. A build produces one state or the other, never a mixture, so this is a previous \`rehost\` that died partway — an unwritable file, a full disk, a Ctrl-C. Carrying on would give every file in the first list a SECOND base path on ${NOT_A_PAGE} and a stamp it does not need, and the post-conditions could not see it (they read declared URLs, which are correct in both halves). Rebuild and stamp the fresh artifact:\n\n    npm run build && npm run rehost ${raw}`,
      [
        ...written.map((file) => `already stamped  ${file.name}`),
        ...stampable
          .filter((file) => file.sentinels > 0)
          .map((file) => `still unstamped   ${file.name} (${file.sentinels})`),
      ],
    );
  }

  // ── 2. Stamp ───────────────────────────────────────────────────────────────
  // Every edit is computed BEFORE the first one is written: a mapper that throws
  // (a malformed 404, a file that is not text after all) then fails with `dist/`
  // untouched rather than half-stamped. What the writes cannot avoid — a disk
  // that fills on the ninth file — is left in the one shape the precondition
  // above can recognise, one file at a time and never a torn one.
  /** @type {Map<string, string>} */
  const pending = new Map();
  let stampedValues = 0;
  let notFoundLinks = 0;
  for (const [file, source] of contents) {
    const name = distRelative(file);
    if (!STAMPED(name)) continue;
    const { text: swapped, changed } = stampSentinel(source, target.deployment);
    let next = swapped;
    stampedValues += changed;
    if (name === NOT_A_PAGE) {
      const { html, changed: prefixed } = prefixRootAbsolute(
        next,
        target.basePath,
      );
      next = html;
      notFoundLinks = prefixed;
    }
    if (next !== source) pending.set(file, next);
  }
  let written = 0;
  for (const [file, next] of pending) {
    try {
      writeAtomic(file, next);
    } catch (error) {
      // The one failure that leaves `dist/` in a state worth naming. Said out
      // loud here rather than thrown as a stack trace, because what the operator
      // has to know is not `EACCES` — it is that the artifact is now half
      // stamped, that the next run will refuse it, and that a rebuild is the
      // way out.
      fail(
        `${distRelative(file)} could not be written (${error instanceof Error ? error.message : String(error)}). dist/ is now HALF STAMPED — ${written} of ${pending.size} files are done — and re-running would give ${NOT_A_PAGE} a second base path, so the next run will refuse it. Rebuild and stamp the fresh artifact:\n\n    npm run build && npm run rehost ${raw}`,
      );
    }
    contents.set(file, next);
    written += 1;
  }
  const stampedFiles = pending.size;

  // ── 3. Post-conditions ─────────────────────────────────────────────────────
  // deployment.md §2.1's manual grep, made executable and made stricter: not
  // "one origin" but "the deployment URL, sub-path included", because an origin
  // that is right while the sub-path is missing is the exact defect this whole
  // stage exists to close.
  /** @type {string[]} */
  const leaked = [];
  for (const [file, source] of contents) {
    const remaining = countSentinels(source);
    if (remaining > 0) {
      leaked.push(`${distRelative(file)} (${remaining})`);
    }
  }
  if (leaked.length > 0) {
    fail(
      `the sentinel ${SENTINEL} survived the stamp. Every one of these would ship a URL that cannot resolve — and a sentinel outside an HTML/sitemap/robots file means something new writes ${SENTINEL} into the build, which this script does not know how to stamp.`,
      leaked,
    );
  }

  /** @type {string[]} */
  const strays = [];
  /** @type {Set<string>} */
  const origins = new Set();
  let declaredCount = 0;
  let pagesChecked = 0;
  for (const [file, source] of contents) {
    const name = distRelative(file);
    /** @type {{ what: string, url: string }[]} */
    let declared = [];
    if (name.endsWith('.html')) {
      declared = declaredUrlsInPage(source);
      // A page with no canonical would sail through the loop below having
      // asserted nothing at all.
      if (!declared.some((entry) => entry.what === 'canonical')) {
        strays.push(`${name}: no canonical to check`);
      }
      pagesChecked += 1;
    } else if (name === 'sitemap.xml') {
      declared = [...source.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => ({
        what: '<loc>',
        url: match[1] ?? '',
      }));
    } else if (name === 'robots.txt') {
      declared = [...source.matchAll(/^Sitemap:\s*(\S+)/gm)].map((match) => ({
        what: 'Sitemap:',
        url: match[1] ?? '',
      }));
    }
    for (const { what, url } of declared) {
      declaredCount += 1;
      try {
        origins.add(new URL(url).origin);
      } catch {
        strays.push(`${name} ${what}: "${url}" is not an absolute URL`);
        continue;
      }
      if (!url.startsWith(`${target.deployment}/`)) {
        strays.push(`${name} ${what}: ${url}`);
      }
    }
  }
  if (strays.length > 0) {
    fail(
      `a declared URL does not start with ${target.deployment}/ — the deployment would tell crawlers and social scrapers about a URL it does not serve`,
      strays,
    );
  }
  if (origins.size !== 1) {
    fail(
      `expected exactly one origin across every declared URL, found ${origins.size}`,
      [...origins],
    );
  }

  // ── 4. Summary ─────────────────────────────────────────────────────────────
  say(`rehost — dist/ now names ${target.deployment} (Plan D §4.3)`);
  say(
    `  ${stampedValues} metadata values stamped across ${stampedFiles} files (pages, sitemap.xml, robots.txt)`,
  );
  say(
    target.basePath === ''
      ? `  ${NOT_A_PAGE}: root deployment, its links already start at / (§4.4)`
      : `  ${NOT_A_PAGE}: ${notFoundLinks} root-absolute links prefixed with ${target.basePath}/ (§4.4)`,
  );
  say(
    `  clean: 0 ${SENTINEL} left anywhere in dist/; ${declaredCount} declared URLs across ${pagesChecked} pages + sitemap + robots, all under ${target.deployment}/, ${origins.size} origin`,
  );
}

// Importable for unit tests, executable as a deploy step.
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}

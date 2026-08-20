/**
 * build-fonts.mjs — generates the two self-hosted webfont subsets AND their
 * metric-matched fallback numbers, from the site's own content.
 *
 * Run it by hand: `npm run fonts`. Never part of `npm run build` — it needs the
 * network, and the outputs are committed. Same posture as `npm run og` and
 * `npm run icons`.
 *
 * Outputs, all committed:
 *   public/fonts/plex-sans.woff2   IBM Plex Sans, variable wght, latin subset
 *   public/fonts/plex-mono.woff2   IBM Plex Mono, latin subset
 *   src/styles/font-charset.ts     the character manifest the subsets cover,
 *                                  plus the measured byte sizes and the
 *                                  fallback-matching metrics
 *
 * ── WHY A SUBSET, AND WHY GENERATED FROM THE CONTENT ─────────────────────────
 * The full IBM Plex Sans variable file is 352 KB. Google Fonts' stock `latin`
 * subset is 62 KB but **does not contain the arrow glyph**: `→` appears 60-odd
 * times in this site's chrome ("Start lesson →"), and every stock latin subset
 * of every candidate face renders it from a fallback serif. That was measured,
 * not assumed — see `docs/redesign-2026-08/02-design-system.md`.
 *
 * So the subset is cut to exactly the characters the site can render: printable
 * ASCII, Latin-1 Supplement, Latin Extended-A (headroom for names and loanwords
 * a future lesson might use), and the punctuation/mathematical/dingbat glyphs
 * this repo actually contains. That last set is DERIVED by scanning `src/`
 * rather than hand-listed, exactly as the OG card is derived from the real
 * renderer: a hand-listed set drifts the moment a lesson gains a character.
 *
 * `tests/unit/font-charset.test.ts` is the standing guard — it re-scans `src/`
 * and fails if a character appears that the committed subsets do not cover, so
 * "run `npm run fonts`" is a failing test rather than a habit.
 *
 * ── WHY CHROMIUM IS INVOLVED ─────────────────────────────────────────────────
 * Two things here can only be answered by a shaping engine, and this repo
 * already ships one (Playwright's Chromium, a devDependency — no package added,
 * the same trade `build-icons.mjs` documents):
 *
 *   1. COVERAGE. A `unicode-range` in the CSS Google returns says which
 *      codepoints were *requested*, not which ones the font actually has. The
 *      only truthful check is to render each character and ask which physical
 *      font the engine resolved it to (CDP `CSS.getPlatformFontsForNode`).
 *   2. FALLBACK METRICS. `size-adjust` / `ascent-override` / `descent-override`
 *      exist to make the fallback occupy the same box as the webfont, which is
 *      what buys CLS 0 on a cold load. Those numbers are a RATIO between two
 *      real fonts and are measured here, never estimated.
 */
import { chromium } from 'playwright-core';
import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';

/* global fetch -- Node ships a global fetch from 18; ESLint's `js.configs
   .recommended` env has no opinion about Node globals, and the two sibling
   scripts declare theirs the same way. */

/** Writes one line to stdout. `no-console` is an absolute ban in this repo (§18),
 *  and a hand-run generator still owes its operator the numbers it measured. */
const say = (line) => process.stdout.write(`${line}\n`);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const FONT_DIR = path.join(ROOT, 'public', 'fonts');

/**
 * The two faces, and the Google Fonts family spec each is cut from.
 *
 * IBM Plex was chosen over Inter and Source Sans 3 on a rendered comparison
 * (`docs/redesign-2026-08/02-design-system.md`): it is one family designed as a
 * system, so the sans (the human voice) and the mono (the machine's) are a
 * deliberate pair rather than an accident of whatever mono the reader's OS
 * happens to ship — and that distinction is load-bearing in this product.
 *
 * No italic file. The italic subset measured 66,980 bytes to serve a few dozen
 * short `<em>` spans; browsers synthesise an oblique from the variable upright,
 * which is the cheaper honest trade. Revisit if emphasis ever becomes load-bearing.
 */
const FACES = [
  {
    file: 'plex-sans.woff2',
    family: 'IBM Plex Sans',
    spec: 'IBM+Plex+Sans:wght@100..700',
  },
  {
    file: 'plex-mono.woff2',
    family: 'IBM Plex Mono',
    spec: 'IBM+Plex+Mono:wght@400;500;600',
  },
];

/**
 * The fallback the metric overrides are tuned against. Arial is the one face
 * present on effectively every desktop and phone; `Liberation Sans` is its
 * metric clone on Linux, and `Helvetica` covers older Apple systems. One tuned
 * fallback beats trying to match `system-ui`, which resolves to a different
 * face — with different metrics — on every platform.
 */
const FALLBACK_LOCALS = ['Arial', 'Helvetica', 'Liberation Sans'];

/** File extensions worth scanning for renderable characters. */
const SCANNED = new Set(['.astro', '.mdx', '.ts', '.tsx', '.css', '.json']);

/** Codepoint ranges always included, whether or not the repo uses them today. */
const ALWAYS = [
  [0x20, 0x7e], // printable ASCII
  [0xa0, 0xff], // Latin-1 Supplement
  [0x100, 0x17f], // Latin Extended-A
];

/**
 * Every character the built site could render, derived from `src/`.
 *
 * Over-inclusive on purpose: it scans source comments too, because a comment
 * costs nothing in the subset and a missed glyph costs a fallback mid-word.
 *
 * @param dir - Directory to walk.
 * @param into - Accumulating set of characters.
 * @returns The set, for convenience.
 */
async function collectChars(dir, into = new Set()) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await collectChars(full, into);
    else if (SCANNED.has(path.extname(entry.name)))
      for (const ch of await readFile(full, 'utf8')) into.add(ch);
  }
  return into;
}

/**
 * The subset request string: the always-on ranges plus every non-ASCII printable
 * the repo contains, sorted so the request — and therefore the generated file —
 * is byte-stable across runs.
 *
 * @param found - Characters scanned out of `src/`.
 * @returns The `text=` payload, deduplicated and ordered by codepoint.
 */
function subsetText(found) {
  const chars = new Set();
  for (const [lo, hi] of ALWAYS)
    for (let c = lo; c <= hi; c++) chars.add(String.fromCodePoint(c));
  for (const ch of found) {
    const code = ch.codePointAt(0);
    // Control characters and the space have no glyph to subset.
    if (code < 0x21) continue;
    // Astral-plane characters (emoji) are deliberately out: nothing in this
    // site's copy uses one, and including them would pull in a colour table.
    if (code > 0xffff) continue;
    chars.add(ch);
  }
  return [...chars]
    .sort((a, b) => a.codePointAt(0) - b.codePointAt(0))
    .join('');
}

/**
 * Downloads one subset from the Google Fonts CSS2 API.
 *
 * The API returns a stylesheet whose `src` points at a generated woff2 holding
 * exactly the requested characters, with the family's variable axes intact —
 * which is why this needs no local subsetting toolchain (and therefore no new
 * dependency, Python or otherwise).
 *
 * @param spec - Family spec, e.g. `IBM+Plex+Sans:wght@100..700`.
 * @param text - The characters to cut down to.
 * @returns The woff2 bytes.
 */
async function fetchSubset(spec, text) {
  // A modern desktop UA is required: Google serves woff2 only to clients it
  // believes support it, and falls back to ttf otherwise.
  const ua =
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const cssUrl = `https://fonts.googleapis.com/css2?family=${spec}&text=${encodeURIComponent(text)}&display=swap`;
  const css = await (
    await fetch(cssUrl, { headers: { 'User-Agent': ua } })
  ).text();
  const src = /url\((https:\/\/[^)]+)\)/.exec(css);
  if (!src)
    throw new Error(
      `No font URL in the CSS for ${spec}. Response began: ${css.slice(0, 200)}`,
    );
  const res = await fetch(src[1]);
  if (!res.ok) throw new Error(`${spec}: font fetch failed (${res.status})`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Asserts the downloaded face really renders every character, and measures the
 * fallback-matching metrics, in one Chromium page per face.
 *
 * @param page - A Playwright page.
 * @param cdp - Its CDP session, with DOM+CSS domains enabled.
 * @param face - The face descriptor.
 * @param bytes - The downloaded woff2.
 * @param text - The characters that must all resolve to this face.
 * @returns `{ missing, metrics }` — missing characters (should be empty) and the
 *          `size-adjust` / ascent / descent percentages for the fallback face.
 */
async function verifyAndMeasure(page, cdp, face, bytes, text) {
  const b64 = bytes.toString('base64');
  const chars = [...text].filter((c) => c.codePointAt(0) > 0x20);
  /* global document -- the callbacks below are serialized and run INSIDE the
     page, where `document` is the browser's; ESLint reads this file as Node. */
  await page.setContent(
    `<style>
       @font-face{font-family:'X';src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:100 900}
       body{margin:0}span{font-family:'X';font-size:40px}
     </style>
     <body>${chars.map((c, i) => `<span id="g${i}">${escapeHtml(c)}</span>`).join('')}</body>`,
  );
  await page.evaluate(() => document.fonts.ready);

  const { root } = await cdp.send('DOM.getDocument');
  const missing = [];
  for (let i = 0; i < chars.length; i++) {
    const { nodeId } = await cdp.send('DOM.querySelector', {
      nodeId: root.nodeId,
      selector: `#g${i}`,
    });
    const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
    // A character the engine could not find in 'X' is served by some other
    // physical font; the family name is how we tell.
    if (!fonts.some((f) => f.familyName.startsWith(face.family.split(' ')[0])))
      missing.push(
        `${chars[i]} (U+${chars[i].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')})`,
      );
  }

  const metrics = await page.evaluate(
    ({ locals }) => {
      // A pangram-ish sample weighted toward the letters this site actually
      // sets: an average advance width is what `size-adjust` has to equalise.
      const SAMPLE =
        'The quick brown fox jumps over the lazy dog 0123456789 binary search complexity';
      const c = document.createElement('canvas').getContext('2d');
      const measure = (family) => {
        c.font = `100px ${family}`;
        const m = c.measureText(SAMPLE);
        return {
          width: m.width,
          ascent: m.fontBoundingBoxAscent,
          descent: m.fontBoundingBoxDescent,
        };
      };
      const web = measure(`'X'`);
      const fallback = measure(locals.map((l) => `'${l}'`).join(', '));
      return {
        // Scale the FALLBACK so its average advance matches the webfont's.
        sizeAdjust: (web.width / fallback.width) * 100,
        // …then give it the webfont's own box, at that adjusted size, so the
        // line box does not change height when the swap happens.
        ascent: (web.ascent / 100 / (web.width / fallback.width)) * 100,
        descent: (web.descent / 100 / (web.width / fallback.width)) * 100,
      };
    },
    { locals: FALLBACK_LOCALS },
  );

  return { missing, metrics };
}

/** Escapes the five characters that would otherwise be markup. */
function escapeHtml(s) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
}

const found = await collectChars(SRC);
const text = subsetText(found);
say(`charset: ${[...text].length} characters derived from src/`);

await mkdir(FONT_DIR, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send('DOM.enable');
await cdp.send('CSS.enable');

const report = [];
/** Characters no committed face can draw — see the note below the loop. */
let uncovered = null;
for (const face of FACES) {
  const bytes = await fetchSubset(face.spec, text);
  const { missing, metrics } = await verifyAndMeasure(
    page,
    cdp,
    face,
    bytes,
    text,
  );
  await writeFile(path.join(FONT_DIR, face.file), bytes);
  report.push({ ...face, bytes: bytes.length, metrics, missing });
  say(
    `${face.family}: ${bytes.length} bytes, ${[...text].length - missing.length}/${[...text].length} characters covered`,
  );
  // Intersect: a character only counts as uncovered when NEITHER face has it.
  const gap = new Set(missing.map((m) => m[0]));
  uncovered =
    uncovered === null
      ? gap
      : new Set([...uncovered].filter((c) => gap.has(c)));
}
await browser.close();

/**
 * The glyphs neither face draws. Every one of these is a GEOMETRIC MARKER —
 * `▲ ▶ ▼` carets, the `✕` delete mark, `⌀`/`∅` for null and empty, `⋯`/`▁` for
 * the comparing and range legend swatches, `ⁿ` in `O(2ⁿ)` — and every one is
 * already served by the reader's system font TODAY, because the site has always
 * set them in the system stack. Self-hosting therefore changes nothing about
 * them; it is the running prose and UI that move onto a known face.
 *
 * They are written into the manifest so the situation is recorded rather than
 * assumed, and `tests/unit/font-charset.test.ts` fails when a NEW character
 * joins the list — which is the moment to decide whether to redraw it as SVG,
 * swap it for a covered character, or accept the fallback deliberately.
 */
const fallbackGlyphs = [...(uncovered ?? [])].sort(
  (a, b) => a.codePointAt(0) - b.codePointAt(0),
);
say(
  `\nserved by the system fallback (unchanged from before self-hosting): ${fallbackGlyphs.join(' ')}`,
);

// The manifest. It is TypeScript rather than JSON so the unit guard can import
// it without a resolver flag, and so the numbers carry their own explanation.
const manifest = `/**
 * Generated by \`npm run fonts\` (scripts/build-fonts.mjs) — DO NOT EDIT BY HAND.
 *
 * The character set the committed webfont subsets in \`public/fonts/\` cover, and
 * the measured facts about them. \`tests/unit/font-charset.test.ts\` re-derives the
 * set from \`src/\` and fails if the two disagree, which is the signal to re-run
 * the script.
 */

/** Every character the committed subsets were cut for, ordered by codepoint. */
export const FONT_CHARSET = ${JSON.stringify(text)};

/**
 * Characters NEITHER committed face draws, so the reader's system font supplies
 * them. All of them are geometric markers the site has always set in the system
 * stack (visualizer carets, the delete mark, null/empty symbols, the legend's
 * comparing and range swatches, the superscript in \`O(2ⁿ)\`), so self-hosting
 * did not move them. A new entry here is a decision to make, not a fact to
 * absorb — redraw it as SVG, swap it for a covered character, or accept it.
 */
export const FONT_FALLBACK_GLYPHS = ${JSON.stringify(fallbackGlyphs.join(''))};

/** Measured byte size of each committed subset. A claim about the build, measured. */
export const FONT_BYTES: Record<string, number> = ${JSON.stringify(
  Object.fromEntries(report.map((r) => [r.file, r.bytes])),
  null,
  2,
)};

/**
 * Fallback metric overrides, measured against ${FALLBACK_LOCALS.join(' / ')} in the
 * shaping engine — these are what buy CLS 0 while the webfont loads. Mirrored
 * into the \`@font-face\` blocks in \`src/styles/tokens.css\`; keep the two in sync.
 */
export const FONT_FALLBACK_METRICS = ${JSON.stringify(
  Object.fromEntries(
    report.map((r) => [
      r.file,
      {
        sizeAdjust: `${r.metrics.sizeAdjust.toFixed(2)}%`,
        ascentOverride: `${r.metrics.ascent.toFixed(2)}%`,
        descentOverride: `${r.metrics.descent.toFixed(2)}%`,
      },
    ]),
  ),
  null,
  2,
)} as const;
`;
await writeFile(path.join(SRC, 'styles', 'font-charset.ts'), manifest);

say('\n--- paste-ready @font-face metrics ---');
for (const r of report) {
  say(
    `${r.file}: size-adjust: ${r.metrics.sizeAdjust.toFixed(2)}%; ascent-override: ${r.metrics.ascent.toFixed(2)}%; descent-override: ${r.metrics.descent.toFixed(2)}%;`,
  );
}
const total = report.reduce((n, r) => n + r.bytes, 0);
say(`\ntotal committed font bytes: ${total} (${(total / 1024).toFixed(1)} KB)`);

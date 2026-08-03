/**
 * build-og.mjs — regenerates the site's Open Graph card FROM THE REAL RENDERER.
 *
 * Run it by hand: `npm run og`
 *   (= `node --experimental-transform-types scripts/build-og.mjs`)
 *
 * Outputs, both committed:
 *   public/og-source.svg   the reviewable source — a 1200x630 card whose drawing
 *                          is `arrayRenderer.renderStatic()`'s own bytes
 *   public/og-default.png  the raster BaseLayout links as og:image (scrapers do
 *                          not render SVG)
 *
 * WHY THIS EXISTS. The first branded card was hand-exported from a vector editor,
 * and its binary-search frame was an approximation of the renderer's: it had no
 * index row under the cells — the row that gives lo / mid / hi anything to point
 * at — and review also found its marker spacing off. The site's own face was
 * advertising a
 * product that does not exist, which is the worst place to do it. CLAUDE.md's
 * standing rule for this area is "never hand-mock the product": hero art, legends
 * and demo frames come from the real renderer's build-time `renderStatic()` output
 * so they cannot drift. This script is that rule applied to the OG card, and it is
 * the same build-time path `src/viz/Visualizer.astro`, the home hero panel and the
 * 404 still already take (architecture §1): await the lazy registry thunks, run
 * the real algorithm, hand one real `Step` to the real renderer.
 *
 * NOT WIRED INTO `npm run build`. The build stays dependency-free and fast, and it
 * must not need a browser; the card changes about as often as the logo does. Edit
 * this script and re-run it — never edit the SVG or the PNG by hand.
 *
 * ── Reproducing the PNG ───────────────────────────────────────────────────────
 * Rasterised by the Chromium that Playwright already ships (`@playwright/test` is
 * a devDependency, so this adds no package): a page with a 1200x630 viewport and
 * deviceScaleFactor 1 opens `public/og-source.svg` over file:// and is screenshot
 * with an explicit 1200x630 clip. The script then asserts the PNG's own IHDR says
 * 1200x630 before it claims success. If the browser binary is missing, run
 * `npx playwright install chromium`. `rsvg-convert`, `magick` and `inkscape` would
 * all work on a machine that has them, but only Chromium is guaranteed by this
 * repo's toolchain — and it is the engine whose CSS support (custom properties,
 * `color-mix()`) matches the stylesheet below.
 *
 * One reproducibility caveat, inherited from the site itself: the card sets
 * `--font-sans`/`--font-mono`, which are system stacks (tokens.css SPEC-GAP §19),
 * so the wordmark and headline are drawn in whatever the GENERATING machine
 * resolves `system-ui` to. Re-running on another OS re-letters the card. That is
 * the same trade the live site makes on every page, and the alternative — an
 * embedded webfont — would be a new asset the spec does not ask for.
 *
 * ── Why the two node flags/hooks ──────────────────────────────────────────────
 * `src/viz` is written for a bundler, so plain Node needs two nudges to import it:
 *   1. `--experimental-transform-types`, because `ArrayRenderer` uses a TypeScript
 *      parameter property (`constructor(private readonly variant: Variant)`), which
 *      Node's default strip-only mode rejects outright;
 *   2. the `registerHooks` resolver below, because the modules import each other
 *      with extensionless specifiers (`'../core/ids'`), which ESM does not resolve.
 * Neither touches the shipped build — Vite handles both there.
 */
import { registerHooks } from 'node:module';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { URL, fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
// The renderer's own escaper — the card's text goes through the same one as the
// drawing's, so there is exactly one definition of "safe to inline into markup".
import { esc } from '../src/viz/core/svg.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SVG_OUT = path.join(ROOT, 'public', 'og-source.svg');
const PNG_OUT = path.join(ROOT, 'public', 'og-default.png');

/** Resolve `'../core/ids'` → `'../core/ids.ts'` for the bundler-style src tree. */
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && !path.extname(specifier)) {
      const candidate = new URL(`${specifier}.ts`, context.parentURL);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

// ---------------------------------------------------------------------------
// 1. The drawing: a real trace, a real step, the real renderer.
// ---------------------------------------------------------------------------

/**
 * The card's own input, parsed by the algorithm itself (the 404 page sets the
 * same precedent). Ten items rather than the lesson's six (`[1,3,5,7,9,11]`): the
 * card is a 1200x630 letterbox, and six cells either leave half of it empty or get
 * blown up to a size the lesson never shows. No value runs past two digits, so no
 * cell's text outgrows the 54-unit box the renderer sizes for.
 */
const OG_INPUT = '[2,5,8,12,16,23,38,56,72,91] target=23';

const { algorithms, renderers } = await import(
  pathToFileURL(path.join(ROOT, 'src/viz/registry.ts')).href
);
const algorithm = await algorithms['binary-search']();
const renderer = await renderers.array();

const parsed = algorithm.parseInput(OG_INPUT);
if (parsed && typeof parsed === 'object' && 'error' in parsed) {
  throw new Error(`OG card input rejected: ${parsed.error}`);
}
const trace = algorithm.run(parsed);

/** Ids in a step's search-window highlight (0 when it has none). */
const windowSize = (step) =>
  (step.highlights ?? []).find((h) => h.kind === 'range')?.ids.length ?? 0;

/**
 * The frame to show: the FIRST step whose window has already narrowed and that
 * still probes a cell. That rules out step 0 (whole array, no probe) and the
 * final "found" frame, so the picture is unmistakably an algorithm mid-run — and
 * the first such step keeps the most cells alive, which matters on a card that is
 * usually seen at half size. The home hero picks the LAST narrowing step instead
 * (`src/pages/index.astro`) because it shows six cells, not ten; the two rules are
 * deliberately different and each is derived from its own trace, so neither can be
 * left pointing at a step that no longer exists.
 */
const fullWindow = windowSize(trace[0]);
const stepIndex = trace.findIndex(
  (step) =>
    windowSize(step) > 0 &&
    windowSize(step) < fullWindow &&
    (step.highlights ?? []).some((h) => h.kind === 'active'),
);
if (stepIndex < 0) {
  throw new Error(
    `OG card: "${OG_INPUT}" never produces a narrowed window with a probe in it — there is no mid-run frame to draw.`,
  );
}
const step = trace[stepIndex];

const still = renderer.renderStatic(step, {
  title: algorithm.label,
  // Stable, not random: these ids land in a committed file, and a value that
  // changed per run would make every regeneration a diff.
  idBase: 'og-still',
});

/**
 * Anti-drift guard, the same one the hero and 404 stills carry: this file
 * restates the handful of `.viz-*` rules the frame needs (the visualizer's
 * `is:global` stylesheet only ships on pages that mount the island), so the build
 * fails loudly if the renderer stops emitting a class that is styled below.
 * `viz-cell__index` is listed first on purpose — the index row is exactly what
 * the hand-drawn card had lost.
 */
const STILL_CLASSES = [
  'viz-cell__index',
  'viz-cell__rect',
  'viz-cell__value',
  'is-range',
  'is-active',
  'is-eliminated',
  'viz-range-bar',
  'viz-marker',
  'viz-mid-label',
];
const missing = STILL_CLASSES.filter((cls) => !still.includes(cls));
if (missing.length > 0) {
  throw new Error(
    `OG still no longer emits: ${missing.join(', ')}. The renderer's class contract changed — update this script's styles with it.`,
  );
}
const cellCount = step.state.array.length;
const indexLabels = still.match(/viz-cell__index/g)?.length ?? 0;
if (indexLabels !== cellCount) {
  throw new Error(
    `OG still draws ${indexLabels} index labels for ${cellCount} cells — the drawing is not the renderer's.`,
  );
}

// ---------------------------------------------------------------------------
// 2. Colour + type: read out of tokens.css, never retyped.
// ---------------------------------------------------------------------------

/**
 * The card is a standalone SVG, so it cannot inherit the site's stylesheet — but
 * it can be BUILT from it. Everything below is lifted from the light-theme `:root`
 * block of `src/styles/tokens.css` at generation time, so re-running this script
 * after a token change repaints the card; a token that disappears fails here
 * instead of silently painting black.
 */
const tokensCss = readFileSync(
  path.join(ROOT, 'src/styles/tokens.css'),
  'utf8',
);
const lightBlockEnd = tokensCss.indexOf('color-scheme: light;');
if (lightBlockEnd < 0) {
  throw new Error(
    'tokens.css: could not find the end of the light :root block ("color-scheme: light;").',
  );
}
const lightBlock = tokensCss.slice(tokensCss.indexOf(':root {'), lightBlockEnd);

/** Light-theme value of one custom property (throws if it is gone). */
function token(name) {
  const match = lightBlock.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'));
  if (!match) throw new Error(`tokens.css has no light value for ${name}.`);
  return match[1].trim();
}

/** Every token the card paints with; emitted as a `:root` block into the SVG. */
const USED_TOKENS = [
  '--font-sans',
  '--font-mono',
  '--weight-semibold',
  '--weight-bold',
  '--weight-heavy',
  '--bg',
  '--surface',
  '--text',
  '--text-muted',
  '--border',
  '--border-strong',
  '--brand',
  '--hl-active',
  '--radius-card',
];
const tokenBlock = USED_TOKENS.map((name) => `      ${name}: ${token(name)};`)
  .join('\n')
  .trimStart();

// `rx` is an SVG attribute here rather than the CSS geometry property, so the
// source renders in viewers older than the Chromium that rasterises it.
const cardRadius = Number.parseFloat(token('--radius-card'));

// ---------------------------------------------------------------------------
// 3. Layout. Derived from the drawing's real viewBox, then asserted.
// ---------------------------------------------------------------------------

/**
 * The card is a FIXED 1200x630 canvas, so the site's `--text-*` tokens — every one
 * of them a viewport `clamp()` — have nothing to resolve against; the sizes below
 * are the card's own, chosen for this canvas. Colour, font family, weight and
 * radius still come from tokens (above), which is where drift actually hurts.
 */
const CARD_W = 1200;
const CARD_H = 630;
const MARGIN = 64; // --space-16
const RULE_H = 8; // brand keyline across the top edge
const MARK = 56; // the favicon mark's box
const MARK_Y = 44;
const WORDMARK_SIZE = 40;
const WORDMARK_BASELINE = 86;
const TITLE_SIZE = 58;
const TITLE_LEADING = 64;
const TITLE_BASELINE = 186;
const SUB_SIZE = 26;
const SUB_BASELINE = 300;
const FRAME_PAD = 24; // --space-6, the viz frame's own desktop padding
const DRAW_MAX_H = 190;

/**
 * The headline is the home hero's `<h1>` verbatim (`src/pages/index.astro`), split
 * where the page's own 20ch cap splits it. The tagline is the card's own line: the
 * hero's three-sentence subhead does not fit one 26px row, and repeating the
 * og:description would only duplicate the text the scraper prints beside the image.
 */
const TITLE_LINES = ['See data structures and', 'algorithms in motion'];
const SUBTITLE =
  'Free, interactive lessons — play, pause, and step through every algorithm.';

const viewBox = still.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/);
if (!viewBox) {
  throw new Error('OG still has no parsable viewBox — cannot place it.');
}
const [drawUnitsW, drawUnitsH] = [Number(viewBox[1]), Number(viewBox[2])];

const frameW = CARD_W - MARGIN * 2;
const scale = Math.min(
  DRAW_MAX_H / drawUnitsH,
  (frameW - FRAME_PAD * 2) / drawUnitsW,
);
const drawW = drawUnitsW * scale;
const drawH = drawUnitsH * scale;
const frameH = drawH + FRAME_PAD * 2;
const frameY = CARD_H - MARGIN - frameH;
const drawX = MARGIN + (frameW - drawW) / 2;
const drawY = frameY + FRAME_PAD;

// A longer array makes the frame taller and walks it up into the tagline, so the
// composition is asserted rather than eyeballed: 12px below the tagline's baseline
// clears its descenders and leaves a hair of breathing room.
if (SUB_BASELINE + 12 >= frameY) {
  throw new Error(
    `OG card layout: the frame starts at y=${frameY.toFixed(1)} and the tagline runs to y=${SUB_BASELINE + 12}. Shorten the array or the type block.`,
  );
}

/** Two decimals is plenty at 1200x630 and keeps the committed SVG readable. */
const round = (n) => Number(n.toFixed(2));

/**
 * Place the still. Its bytes are the renderer's; the ONLY edit is to the root
 * element's sizing attributes, because `renderStatic` sizes for an HTML page
 * (fluid `width="100%"`, `height:auto`) and a nested `<svg>` in a fixed card needs
 * x/y/width/height instead. `viewBox`, `preserveAspectRatio`, `role`,
 * `aria-labelledby` and every child element are untouched, and the exact-string
 * swap fails loudly if that attribute pair ever changes shape.
 */
const FLUID_ATTRS = ' width="100%" style="max-width:100%;height:auto"';
if (!still.includes(FLUID_ATTRS)) {
  throw new Error(
    `OG still's root no longer carries ${FLUID_ATTRS.trim()} — update the placement swap.`,
  );
}
const placedStill = still.replace(
  FLUID_ATTRS,
  ` x="${round(drawX)}" y="${round(drawY)}" width="${round(drawW)}" height="${round(drawH)}"`,
);

// The wordmark is public/favicon.svg's own geometry, inlined and scaled — the two
// marks cannot drift apart either. Its comment is dropped (it explains a favicon,
// not this card) and its 64u viewBox is asserted, since the scale below assumes it.
const favicon = readFileSync(path.join(ROOT, 'public', 'favicon.svg'), 'utf8');
if (!favicon.includes('viewBox="0 0 64 64"')) {
  throw new Error(
    'favicon.svg is no longer a 64x64 viewBox — the wordmark scale below is wrong.',
  );
}
const markInner = favicon
  .slice(favicon.indexOf('>') + 1, favicon.lastIndexOf('</svg>'))
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/\n\s*/g, '\n    ')
  .trim();

// ---------------------------------------------------------------------------
// 4. Compose + write the SVG.
// ---------------------------------------------------------------------------

const cardTitle = 'LearnDSA — see data structures and algorithms in motion';
const cardDesc = `The LearnDSA wordmark above a binary search mid-run: ${step.explanation}`;

const svg = `<?xml version="1.0" encoding="UTF-8"?>
<!-- GENERATED by scripts/build-og.mjs (\`npm run og\`) — do not edit by hand.
     The drawing below is arrayRenderer.renderStatic()'s own output for step
     ${stepIndex + 1} of ${trace.length} of "${OG_INPUT}"; the colours,
     fonts and radius are read out of src/styles/tokens.css at generation time. -->
<svg xmlns="http://www.w3.org/2000/svg" role="img" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}" aria-labelledby="og-card-t og-card-d">
  <title id="og-card-t">${esc(cardTitle)}</title>
  <desc id="og-card-d">${esc(cardDesc)}</desc>
  <style>
    :root {
      ${tokenBlock}
    }

    /* ---- Card chrome ---- */
    .og-bg { fill: var(--bg); }
    .og-rule { fill: var(--brand); }
    .og-frame { fill: var(--surface); stroke: var(--border); stroke-width: 1; }
    .og-wordmark {
      fill: var(--text);
      font-family: var(--font-sans);
      font-size: ${WORDMARK_SIZE}px;
      font-weight: var(--weight-bold);
    }
    .og-title {
      fill: var(--text);
      font-family: var(--font-sans);
      font-size: ${TITLE_SIZE}px;
      font-weight: var(--weight-heavy);
      letter-spacing: -0.025em;
    }
    .og-sub {
      fill: var(--text-muted);
      font-family: var(--font-sans);
      font-size: ${SUB_SIZE}px;
    }

    /* ---- The still's own classes ----
       src/viz/Visualizer.astro owns these rules in an is:global block, but a
       standalone SVG inherits no stylesheet, so the card restates the subset this
       one frame uses — byte-for-byte the same declarations, minus the transitions
       (a static frame never tweens). The STILL_CLASSES guard in the generator
       fails the run if the renderer stops emitting any class named here. */
    .viz-cell__rect {
      fill: var(--surface);
      stroke: var(--border-strong);
      stroke-width: 1.5;
    }
    .viz-cell__value {
      fill: var(--text);
      font-family: var(--font-mono);
      font-size: 20px;
      font-weight: var(--weight-semibold);
    }
    .viz-cell__index {
      fill: var(--text-muted);
      font-family: var(--font-mono);
      font-size: 12px;
    }
    .viz-cell.is-range .viz-cell__rect {
      fill: color-mix(in srgb, var(--hl-active) 15%, var(--surface));
    }
    .viz-cell.is-active {
      transform: translateY(-3px);
    }
    .viz-cell.is-active .viz-cell__rect {
      fill: color-mix(in srgb, var(--hl-active) 15%, var(--surface));
      stroke: var(--hl-active);
      stroke-width: 3;
    }
    .viz-cell.is-eliminated {
      opacity: 0.42;
    }
    .viz-range-bar {
      stroke: var(--hl-active);
      stroke-width: 3;
      stroke-linecap: round;
    }
    .viz-marker {
      fill: var(--text-muted);
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: var(--weight-semibold);
    }
    .viz-mid-label {
      fill: var(--text);
      font-family: var(--font-mono);
      font-size: 12px;
      font-weight: var(--weight-bold);
    }
  </style>

  <rect class="og-bg" x="0" y="0" width="${CARD_W}" height="${CARD_H}"/>
  <rect class="og-rule" x="0" y="0" width="${CARD_W}" height="${RULE_H}"/>

  <g transform="translate(${MARGIN} ${MARK_Y}) scale(${MARK / 64})">
    ${markInner}
  </g>
  <text class="og-wordmark" x="${MARGIN + MARK + 20}" y="${WORDMARK_BASELINE}">LearnDSA</text>

${TITLE_LINES.map(
  (lineText, i) =>
    `  <text class="og-title" x="${MARGIN}" y="${TITLE_BASELINE + i * TITLE_LEADING}">${esc(lineText)}</text>`,
).join('\n')}
  <text class="og-sub" x="${MARGIN}" y="${SUB_BASELINE}">${esc(SUBTITLE)}</text>

  <rect class="og-frame" x="${MARGIN}" y="${round(frameY)}" width="${frameW}" height="${round(frameH)}" rx="${cardRadius}"/>
  ${placedStill}
</svg>
`;

writeFileSync(SVG_OUT, svg, 'utf8');

// ---------------------------------------------------------------------------
// 5. Rasterise + verify.
// ---------------------------------------------------------------------------

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: CARD_W, height: CARD_H },
    deviceScaleFactor: 1,
  });
  await page.goto(pathToFileURL(SVG_OUT).href);

  // Chrome parses a .svg document as XML, so a malformed card shows a
  // <parsererror> instead of the drawing — and would otherwise be screenshot
  // happily. Assert the document IS the card, at exactly the card's size.
  /* global document -- the callback below is serialized and run INSIDE the page,
     where `document` is the browser's; ESLint reads this file as Node. */
  const doc = await page.evaluate(() => {
    const rect = document.documentElement.getBoundingClientRect();
    return {
      tag: document.documentElement.tagName,
      parserError: Boolean(document.querySelector('parsererror')),
      x: rect.x,
      y: rect.y,
      width: rect.width,
      height: rect.height,
    };
  });
  if (doc.tag !== 'svg' || doc.parserError) {
    throw new Error(
      `og-source.svg did not parse as SVG: ${JSON.stringify(doc)}`,
    );
  }
  if (
    doc.x !== 0 ||
    doc.y !== 0 ||
    doc.width !== CARD_W ||
    doc.height !== CARD_H
  ) {
    throw new Error(
      `og-source.svg renders at ${doc.width}x${doc.height} at (${doc.x}, ${doc.y}); expected ${CARD_W}x${CARD_H} at the origin.`,
    );
  }

  await page.screenshot({
    path: PNG_OUT,
    type: 'png',
    clip: { x: 0, y: 0, width: CARD_W, height: CARD_H },
  });
} finally {
  await browser.close();
}

// Read the PNG's own IHDR rather than trusting the request: bytes 0-7 are the
// signature, 16-19 the width and 20-23 the height, both big-endian.
const png = readFileSync(PNG_OUT);
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // prettier-ignore
if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) {
  throw new Error('og-default.png is not a PNG.');
}
const pngW = png.readUInt32BE(16);
const pngH = png.readUInt32BE(20);
if (pngW !== CARD_W || pngH !== CARD_H) {
  throw new Error(
    `og-default.png is ${pngW}x${pngH}; OG cards must be ${CARD_W}x${CARD_H}.`,
  );
}

process.stdout.write(
  [
    `og-source.svg  ${svg.length} bytes — binary search, step ${stepIndex + 1} of ${trace.length}, ${cellCount} cells`,
    `og-default.png ${pngW}x${pngH}, ${(png.length / 1024).toFixed(1)} KB`,
    '',
  ].join('\n'),
);

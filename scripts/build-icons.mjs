/**
 * build-icons.mjs — rasterizes the two PNG favicon derivatives FROM THE SVG.
 *
 * Run it by hand: `npm run icons`
 *
 * Outputs, both committed:
 *   public/favicon-32.png       32x32 RGBA — the raster fallback for browsers
 *                               without SVG-favicon support. Keeps the mark's
 *                               rounded corners TRANSPARENT, because a tab strip
 *                               composites it over its own chrome.
 *   public/apple-touch-icon.png 180x180 opaque, FULL-BLEED — iOS composites home
 *                               screen icons on its own squircle mask, so this
 *                               one drops the plate's corner radius and ships no
 *                               transparency at all; rounded corners here would
 *                               show the wallpaper through the mask's edge.
 *
 * WHY THIS EXISTS. `src/layouts/BaseLayout.astro` has said since M7.1 that "both
 * PNGs are rasterized from public/favicon.svg — regenerate them from it, never
 * redraw the mark by hand", and until now there was no tool to do that: an
 * instruction with nothing behind it. The achromatic repaint is the first change
 * that actually had to honour it, and hand-editing two binaries is exactly the
 * drift CLAUDE.md's "never hand-mock the product" rule exists to prevent. The SVG
 * is the one hand-authored brand literal; everything else derives from it
 * (`scripts/build-og.mjs` inlines the same file into the OG card).
 *
 * ── How it rasterizes ─────────────────────────────────────────────────────────
 * The same engine and the same trade as `build-og.mjs`, deliberately: the
 * Chromium that `@playwright/test` already ships (a devDependency, so this adds
 * no package). A page whose viewport IS the target size opens the SVG over
 * file://, and the screenshot is taken with an explicit clip. The script then
 * reads each PNG's own IHDR back and asserts its dimensions and colour type
 * before it claims success — `omitBackground` and full-bleed are the two
 * properties the comment above promises, so both are checked, not assumed. If
 * the browser binary is missing, run `npx playwright install chromium`.
 *
 * Unlike the OG card this output is pure geometry and flat fills — no text, no
 * `system-ui` — so it is reproducible on any machine, and re-running it on
 * another OS produces the same bytes.
 */
import { Buffer } from 'node:buffer';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SVG_IN = path.join(ROOT, 'public', 'favicon.svg');

const svg = readFileSync(SVG_IN, 'utf8');
if (!svg.includes('viewBox="0 0 64 64"')) {
  throw new Error(
    'favicon.svg is no longer a 64x64 square viewBox — both derivatives below assume it.',
  );
}

/**
 * The full-bleed variant: the same file with the plate's corner radius removed,
 * so the 180 fills its whole canvas. Matched strictly rather than with a loose
 * `rx` strip, so a future mark whose bars gain their own radius cannot silently
 * lose it here.
 */
const PLATE =
  /<rect width="64" height="64" rx="\d+" fill="(#[0-9A-Fa-f]{6})" \/>/;
const plate = PLATE.exec(svg);
if (!plate) {
  throw new Error(
    "favicon.svg's full-bleed plate rect no longer matches " +
      `${PLATE} — the apple-touch-icon variant below cannot square its corners.`,
  );
}
const squared = svg.replace(plate[0], plate[0].replace(/ rx="\d+"/, ''));

const scratch = mkdtempSync(path.join(tmpdir(), 'learndsa-icons-'));
const squaredPath = path.join(scratch, 'favicon-squared.svg');
writeFileSync(squaredPath, squared, 'utf8');

/**
 * One raster. `omitBackground` keeps the page transparent so the SVG's own
 * corners survive; without it Chromium paints an opaque white document first.
 */
async function rasterize(browser, { source, out, size, transparent }) {
  const page = await browser.newPage({
    viewport: { width: size, height: size },
    deviceScaleFactor: 1,
  });
  try {
    await page.goto(pathToFileURL(source).href);
    /* global document -- this callback is serialized and runs INSIDE the page;
       ESLint reads this file as Node. */
    const doc = await page.evaluate(() => {
      const rect = document.documentElement.getBoundingClientRect();
      return {
        tag: document.documentElement.tagName,
        parserError: Boolean(document.querySelector('parsererror')),
        width: rect.width,
        height: rect.height,
      };
    });
    if (doc.tag !== 'svg' || doc.parserError) {
      throw new Error(`${source} did not parse as SVG: ${JSON.stringify(doc)}`);
    }
    if (doc.width !== size || doc.height !== size) {
      throw new Error(
        `${source} renders at ${doc.width}x${doc.height}; expected ${size}x${size}.`,
      );
    }
    await page.screenshot({
      path: out,
      type: 'png',
      omitBackground: transparent,
      clip: { x: 0, y: 0, width: size, height: size },
    });
  } finally {
    await page.close();
  }
}

/**
 * Read the PNG's own IHDR rather than trusting the request: bytes 0-7 are the
 * signature, 16-19 width, 20-23 height, 25 the colour type (6 = RGBA, 2 = RGB).
 */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]); // prettier-ignore
function verify(out, size, colourType) {
  const png = readFileSync(out);
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error(`${out} is not a PNG.`);
  }
  const [w, h, type] = [png.readUInt32BE(16), png.readUInt32BE(20), png[25]];
  if (w !== size || h !== size) {
    throw new Error(`${out} is ${w}x${h}; expected ${size}x${size}.`);
  }
  if (type !== colourType) {
    throw new Error(
      `${out} has PNG colour type ${type}, expected ${colourType} (${
        colourType === 6
          ? 'RGBA — the tab-strip icon keeps transparent corners'
          : 'RGB — the iOS icon must be opaque and full-bleed'
      }).`,
    );
  }
  return `${path.relative(ROOT, out)} ${w}x${h}, ${(png.length / 1024).toFixed(1)} KB`;
}

const TARGETS = [
  {
    source: SVG_IN,
    name: 'favicon-32.png',
    size: 32,
    transparent: true,
    colourType: 6,
  },
  {
    source: squaredPath,
    name: 'apple-touch-icon.png',
    size: 180,
    transparent: false,
    colourType: 2,
  },
];

const browser = await chromium.launch();
const lines = [];
try {
  for (const target of TARGETS) {
    const out = path.join(ROOT, 'public', target.name);
    await rasterize(browser, { ...target, out });
    lines.push(verify(out, target.size, target.colourType));
  }
} finally {
  await browser.close();
}

process.stdout.write([...lines, ''].join('\n'));

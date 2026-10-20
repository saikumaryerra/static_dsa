/**
 * Computed-style comparison engine shared by `scope-audit.mjs` (legacy build vs
 * the same build with Astro's scoping stripped) and `style-parity.mjs` (legacy
 * build vs a migrated build). React migration plan §5 P1 steps 2 and 4, risk R2.
 *
 * WHAT IT MEASURES. Two static builds are served side by side and the same page
 * is opened in both, at the same viewport and colour scheme, with JavaScript
 * disabled (so the page is exactly its server-rendered markup and CSS — the one
 * state both builds are guaranteed to share). For every rendered element, and
 * for its `::before`/`::after` when they generate content, the engine reads
 * `getComputedStyle` — every property, custom properties included — and reports
 * each property whose value differs.
 *
 * HOW IT STAYS AFFORDABLE. A page holds thousands of elements with ~400
 * properties each. The full declaration string per element stays inside the
 * page; only a 32-bit hash of it crosses to Node. Strings are fetched for the
 * elements whose hashes differ, and only those elements are attributed.
 *
 * HOW A DIFFERENCE IS ATTRIBUTED. For each differing element the engine asks the
 * DevTools protocol (`CSS.getMatchedStylesForNode`) for the rules that match it
 * in both builds and, per differing property, picks the declaration that wins
 * the cascade on each side (the last declaring rule in Chrome's cascade order,
 * `!important` first). The caller's `classify` hook turns the two winners into a
 * finding kind and the rule responsible — which is how `scope-audit.mjs` names a
 * leak versus a specificity loss and maps it to its source `.astro` file.
 *
 * ELEMENT KEYS. An element is keyed by its path from `<html>`, each step
 * `tag[i]` where `i` counts preceding siblings with the same tag. `<head>`,
 * `<script>`, `<style>`, `<link>`, `<meta>`, `<template>` and `<title>` are not
 * rendered and are skipped, and so do not shift any index — which matters for
 * style parity, because the migrated build moves its module scripts from the
 * body (where Astro emitted them) to the head (plan §2.2).
 *
 * LIMITS, stated so nobody reads more into a clean run than it proves: only the
 * no-JS initial state is sampled (no `:hover`, `:focus`, open disclosures or
 * island-rendered DOM); a property that differs only in a state the sample
 * never enters is invisible; `::marker`, `::placeholder` and `::selection` are
 * not read.
 *
 * Dependency-free apart from Playwright, which the repository already has.
 */
/* global window, document, getComputedStyle -- referenced only inside the
   functions Playwright serializes and runs in the page, never in Node. */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { chromium } from '@playwright/test';

/**
 * Writes one line to stdout. `console` is banned repo-wide (spec §18).
 *
 * @param {string} line - Text to print.
 */
export const say = (line) => void process.stdout.write(`${line}\n`);

/** The two viewports plan §5 P1 step 2 samples: a phone and a laptop. */
export const VIEWPORTS = [
  { name: 'mobile', width: 390, height: 844 },
  { name: 'desktop', width: 1280, height: 800 },
];

/** Both colour schemes; the site follows `prefers-color-scheme` with JS off. */
export const THEMES = ['light', 'dark'];

/** Extension → Content-Type. Everything the built site emits. */
const TYPES = new Map(
  Object.entries({
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.xml': 'application/xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
  }),
);

/**
 * Serves a built site the way the production host does: directory URLs map to
 * `index.html`, nothing is redirected, anything unmatched gets `404.html`.
 * Deliberately its own tiny server rather than `scripts/serve-dist.mjs`, so the
 * audit runs against the legacy artifact on any commit of the migration.
 *
 * @param {string} root - Absolute path of the `dist/` to serve.
 * @param {number} port - Port to bind on localhost.
 * @returns {Promise<() => Promise<void>>} Resolves once listening, to a closer.
 */
export function serveDir(root, port) {
  const server = createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(
        new URL(request.url ?? '/', 'http://localhost').pathname,
      );
    } catch {
      response.writeHead(400).end();
      return;
    }
    const relative = path.normalize(
      pathname.endsWith('/') ? `${pathname}index.html` : pathname,
    );
    const candidate = path.resolve(path.join(root, relative));
    const inside = candidate.startsWith(root + path.sep);
    const file =
      inside && existsSync(candidate) && statSync(candidate).isFile()
        ? candidate
        : null;
    const target = file ?? path.join(root, '404.html');
    response.writeHead(file ? 200 : 404, {
      'Content-Type':
        TYPES.get(path.extname(target)) ?? 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    createReadStream(target)
      .on('error', () => response.end())
      .pipe(response);
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () =>
      resolve(() => new Promise((done) => server.close(() => done()))),
    );
  });
}

/* ------------------------------------------------------------------------- */
/* In-page capture (runs in the browser; serialized by Playwright)            */
/* ------------------------------------------------------------------------- */

/**
 * Walks the rendered DOM, stores each element's full computed-style string on
 * `window.__styleAudit`, and returns `[key, hash, classes, visible]` per entry.
 * Pseudo-elements are separate entries keyed `<path>::before`/`::after`.
 *
 * @returns {Array<[string, number, string, boolean]>} One row per entry.
 */
function captureInPage() {
  const SKIP = new Set([
    'HEAD',
    'SCRIPT',
    'STYLE',
    'LINK',
    'META',
    'TEMPLATE',
    'TITLE',
    'BASE',
  ]);
  /** FNV-1a, 32-bit: cheap, and a collision only hides a diff on one element. */
  const fnv = (text) => {
    let h = 0x811c9dc5;
    for (let i = 0; i < text.length; i += 1) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };
  // The property list is fixed per page and read with getPropertyValue: walking
  // a CSSStyleDeclaration by index (`style[i]`) costs ~7x more (measured: 57 s
  // against ~8 s on /learn/binary-search/). Standard properties come from the
  // root's computed style; custom properties are not all present on the root
  // (components declare their own), so their names are collected from every
  // rule in every stylesheet instead.
  const names = [];
  const rootStyle = getComputedStyle(document.documentElement);
  for (let i = 0; i < rootStyle.length; i += 1) {
    if (!rootStyle[i].startsWith('--')) names.push(rootStyle[i]);
  }
  const custom = new Set();
  const collect = (rules) => {
    for (const rule of rules) {
      if (rule.style) {
        for (let i = 0; i < rule.style.length; i += 1) {
          if (rule.style[i].startsWith('--')) custom.add(rule.style[i]);
        }
      }
      if (rule.cssRules) collect(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) {
    try {
      collect(sheet.cssRules);
    } catch {
      // A cross-origin sheet cannot be read; the built site has none.
    }
  }
  names.push(...[...custom].sort());
  const serialize = (style) => {
    let text = '';
    for (const name of names) {
      text += `${name}:${style.getPropertyValue(name)};`;
    }
    return text;
  };
  const store = { styles: new Map(), elements: new Map() };
  window.__styleAudit = store;
  const rows = [];
  const visit = (element, key) => {
    const classes = element.getAttribute('class') ?? '';
    const visible = element.getClientRects().length > 0;
    const own = serialize(getComputedStyle(element));
    store.styles.set(key, own);
    store.elements.set(key, element);
    rows.push([key, fnv(own), classes, visible]);
    for (const pseudo of ['::before', '::after']) {
      const style = getComputedStyle(element, pseudo);
      const content = style.getPropertyValue('content');
      if (content === 'none' || content === 'normal') continue;
      const text = serialize(style);
      store.styles.set(key + pseudo, text);
      rows.push([key + pseudo, fnv(text), classes, visible]);
    }
    const seen = new Map();
    for (const child of element.children) {
      if (SKIP.has(child.tagName.toUpperCase())) continue;
      const tag = child.tagName.toLowerCase();
      const index = seen.get(tag) ?? 0;
      seen.set(tag, index + 1);
      visit(child, `${key}>${tag}[${index}]`);
    }
  };
  visit(document.documentElement, 'html');
  return rows;
}

/**
 * Returns the stored computed-style strings for `keys`.
 *
 * @param {string[]} keys - Entry keys from {@link captureInPage}.
 * @returns {Record<string, string>} Key → `name:value;` string.
 */
function stylesInPage(keys) {
  const out = {};
  for (const key of keys) out[key] = window.__styleAudit.styles.get(key) ?? '';
  return out;
}

/**
 * Whether the element at `key` matches any of `selectors` (invalid ones are
 * skipped). Pseudo-element parts are removed first: a `::before` rule "matches"
 * when its originating element does.
 *
 * @param {{ key: string, selectors: string[] }} args - Element key and selectors.
 * @returns {boolean} True when one selector matches.
 */
function matchesInPage({ key, selectors }) {
  const element = window.__styleAudit.elements.get(key.replace(/::.*$/, ''));
  if (!element) return false;
  return selectors.some((selector) => {
    try {
      return element.matches(
        selector.replace(/::?(before|after|marker|placeholder|selection)/g, ''),
      );
    } catch {
      return false;
    }
  });
}

/* ------------------------------------------------------------------------- */
/* Node side                                                                  */
/* ------------------------------------------------------------------------- */

/**
 * Parses a `name:value;` string from {@link captureInPage} into a map. Values
 * never contain `;` followed by a property name at top level in practice, but a
 * value can contain `;` inside a string or url(); the split therefore re-joins
 * fragments that do not start with a property name.
 *
 * @param {string} text - Serialized computed style.
 * @returns {Map<string, string>} Property → value.
 */
function parseStyle(text) {
  const map = new Map();
  let pending = '';
  for (const part of text.split(';')) {
    const joined = pending === '' ? part : `${pending};${part}`;
    const colon = joined.indexOf(':');
    if (colon > 0 && /^-{0,2}[a-z][a-z0-9-]*$/i.test(joined.slice(0, colon))) {
      map.set(joined.slice(0, colon), joined.slice(colon + 1));
      pending = '';
    } else {
      pending = joined;
    }
  }
  return map;
}

/**
 * One side of a comparison: a browser context and a CDP session per page, plus
 * the stylesheet headers CDP reported, so a winning rule can name its origin.
 */
class Side {
  /**
   * @param {import('@playwright/test').Browser} browser - Shared browser.
   * @param {string} origin - `http://127.0.0.1:<port>`.
   * @param {{ width: number, height: number }} viewport - Viewport size.
   * @param {'light' | 'dark'} theme - Emulated colour scheme.
   */
  constructor(browser, origin, viewport, theme) {
    this.browser = browser;
    this.origin = origin;
    this.viewport = viewport;
    this.theme = theme;
    /** @type {Map<string, { sourceURL: string, isInline: boolean, startLine: number }>} */
    this.sheets = new Map();
  }

  /**
   * Opens `url` with JavaScript off, waits for fonts, captures every entry.
   *
   * @param {string} url - Site path, e.g. `/learn/binary-search/`.
   * @returns {Promise<Map<string, { hash: number, classes: string, visible: boolean }>>}
   */
  async open(url) {
    this.context = await this.browser.newContext({
      viewport: this.viewport,
      colorScheme: this.theme,
      javaScriptEnabled: false,
      reducedMotion: 'reduce',
    });
    this.page = await this.context.newPage();
    this.cdp = await this.context.newCDPSession(this.page);
    this.sheets.clear();
    this.cdp.on('CSS.styleSheetAdded', ({ header }) =>
      this.sheets.set(header.styleSheetId, header),
    );
    const response = await this.page.goto(this.origin + url, {
      waitUntil: 'load',
    });
    if (!response || response.status() !== 200) {
      throw new Error(`${this.origin}${url} answered ${response?.status()}`);
    }
    await this.page.evaluate(() => document.fonts.ready.then(() => undefined));
    await this.cdp.send('DOM.enable');
    await this.cdp.send('CSS.enable');
    await this.cdp.send('DOM.getDocument', { depth: 0 });
    const rows = await this.page.evaluate(captureInPage);
    return new Map(
      rows.map(([key, hash, classes, visible]) => [
        key,
        { hash, classes, visible },
      ]),
    );
  }

  /** @param {string[]} keys @returns {Promise<Record<string, string>>} */
  styles(keys) {
    return this.page.evaluate(stylesInPage, keys);
  }

  /** @param {string} key @param {string[]} selectors @returns {Promise<boolean>} */
  matches(key, selectors) {
    return this.page.evaluate(matchesInPage, { key, selectors });
  }

  /**
   * The matched rules for the element (or pseudo-element) at `key`, as
   * `{ rules, inline }` in Chrome's cascade order (lowest precedence first).
   *
   * @param {string} key - Entry key.
   * @returns {Promise<{ rules: object[], inline: object | null }>}
   */
  async matched(key) {
    const [elementKey, pseudo] = key.split('::');
    // A remote object for the element captureInPage stored, turned into the
    // DOM-domain node id the CSS domain wants.
    const { result: remote } = await this.cdp.send('Runtime.evaluate', {
      expression: `window.__styleAudit.elements.get(${JSON.stringify(elementKey)})`,
    });
    if (!remote.objectId) throw new Error(`no element at ${elementKey}`);
    const { nodeId } = await this.cdp.send('DOM.requestNode', {
      objectId: remote.objectId,
    });
    await this.cdp.send('Runtime.releaseObject', { objectId: remote.objectId });
    const result = await this.cdp.send('CSS.getMatchedStylesForNode', {
      nodeId,
    });
    if (pseudo) {
      const entry = (result.pseudoElements ?? []).find(
        (p) => p.pseudoType === pseudo,
      );
      return { rules: entry?.matches ?? [], inline: null };
    }
    return {
      rules: result.matchedCSSRules ?? [],
      inline: result.inlineStyle ?? null,
    };
  }

  /**
   * A stylesheet's display name: the file under `_astro/`/`assets/`, or
   * `inline <style>` with its line.
   *
   * @param {string} id - CDP `styleSheetId`.
   * @returns {string} Human-readable origin.
   */
  sheetName(id) {
    const header = this.sheets.get(id);
    if (!header) return 'unknown sheet';
    if (header.isInline) return `inline <style> @line ${header.startLine + 1}`;
    return header.sourceURL.replace(/^https?:\/\/[^/]+\//, '');
  }

  async close() {
    await this.context?.close();
    this.context = undefined;
  }
}

/**
 * Whether a CDP CSSStyle declares `property` (directly or as a longhand of a
 * declared shorthand), and if so the declaration.
 *
 * @param {any} style - CDP `CSSStyle`.
 * @param {string} property - Computed (longhand or custom) property name.
 * @returns {{ value: string, important: boolean } | null} The declaration.
 */
function declaration(style, property) {
  let found = null;
  for (const entry of style?.cssProperties ?? []) {
    if (entry.disabled || entry.parsedOk === false) continue;
    const hit =
      entry.name === property
        ? entry
        : (entry.longhandProperties ?? []).find((l) => l.name === property);
    if (hit) {
      // Later declarations in one block override earlier ones, except that an
      // !important one is only overridden by another !important one.
      if (!found || !found.important || entry.important) {
        found = { value: entry.value, important: !!entry.important };
      }
    }
  }
  return found;
}

/**
 * The declaration that wins the cascade for `property` among matched rules.
 *
 * @param {{ rules: any[], inline: any }} matched - From {@link Side#matched}.
 * @param {string} property - Property name.
 * @param {Side} side - For stylesheet names.
 * @returns {Winner | null} The winner, or null when the value is inherited or initial.
 *
 * @typedef {{ selector: string, media: string, sheet: string, origin: string,
 *   value: string, important: boolean, sheetId: string, block: string }} Winner
 */
function winner(matched, property, side) {
  let best = null;
  const consider = (candidate) => {
    if (!best || !best.important || candidate.important) best = candidate;
  };
  for (const { rule } of matched.rules) {
    const decl = declaration(rule.style, property);
    if (!decl) continue;
    consider({
      selector: rule.selectorList?.text ?? '',
      media: (rule.media ?? []).map((m) => m.text).join(' and '),
      sheet:
        rule.origin === 'user-agent'
          ? 'user-agent'
          : side.sheetName(rule.styleSheetId),
      origin: rule.origin,
      sheetId: rule.styleSheetId ?? '',
      block: rule.style?.cssText ?? '',
      ...decl,
    });
  }
  const inline = declaration(matched.inline, property);
  if (inline) {
    consider({
      selector: 'style=""',
      media: '',
      sheet: 'inline style attribute',
      origin: 'inline',
      sheetId: '',
      block: matched.inline?.cssText ?? '',
      ...inline,
    });
  }
  return best;
}

/**
 * Compares one page between two served builds at every viewport × theme and
 * returns the findings. `classify` decides the kind and the responsible rule.
 *
 * @param {object} options - What to compare.
 * @param {import('@playwright/test').Browser} options.browser - Shared browser.
 * @param {string} options.beforeOrigin - Origin serving the reference build.
 * @param {string} options.afterOrigin - Origin serving the build under test.
 * @param {string} options.url - Site path.
 * @param {typeof VIEWPORTS} options.viewports - Viewports to sample.
 * @param {string[]} options.themes - Colour schemes to sample.
 * @param {Classify} options.classify - Attribution hook.
 * @param {number} [options.maxElements] - Attribution cap per page × viewport × theme.
 * @returns {Promise<PageResult>} Findings plus structural drift.
 *
 * @typedef {(ctx: { key: string, property: string, before: Winner | null,
 *   after: Winner | null, beforeSide: Side, afterSide: Side }) =>
 *   Promise<{ kind: string, rule: Winner | null, other: Winner | null }>} Classify
 * @typedef {{ findings: object[], onlyBefore: string[], onlyAfter: string[],
 *   truncated: number, compared: number }} PageResult
 */
export async function comparePage({
  browser,
  beforeOrigin,
  afterOrigin,
  url,
  viewports,
  themes,
  classify,
  maxElements = 4000,
}) {
  const findings = [];
  const onlyBefore = new Set();
  const onlyAfter = new Set();
  let truncated = 0;
  let compared = 0;
  for (const viewport of viewports) {
    for (const theme of themes) {
      const before = new Side(browser, beforeOrigin, viewport, theme);
      const after = new Side(browser, afterOrigin, viewport, theme);
      try {
        const [rowsBefore, rowsAfter] = await Promise.all([
          before.open(url),
          after.open(url),
        ]);
        const differing = [];
        for (const [key, row] of rowsBefore) {
          const other = rowsAfter.get(key);
          if (!other) onlyBefore.add(key);
          else if (other.hash !== row.hash) differing.push(key);
        }
        for (const key of rowsAfter.keys()) {
          if (!rowsBefore.has(key)) onlyAfter.add(key);
        }
        compared += rowsBefore.size;
        if (differing.length > maxElements) {
          truncated += differing.length - maxElements;
          differing.length = maxElements;
        }
        const [stylesBefore, stylesAfter] = await Promise.all([
          before.styles(differing),
          after.styles(differing),
        ]);
        for (const key of differing) {
          const a = parseStyle(stylesBefore[key]);
          const b = parseStyle(stylesAfter[key]);
          const properties = [...new Set([...a.keys(), ...b.keys()])].filter(
            (p) => a.get(p) !== b.get(p),
          );
          if (properties.length === 0) continue;
          const [matchedBefore, matchedAfter] = await Promise.all([
            before.matched(key),
            after.matched(key),
          ]);
          const row = rowsBefore.get(key);
          for (const property of properties) {
            const winBefore = winner(matchedBefore, property, before);
            const winAfter = winner(matchedAfter, property, after);
            const verdict = await classify({
              key,
              property,
              before: winBefore,
              after: winAfter,
              beforeSide: before,
              afterSide: after,
            });
            findings.push({
              page: url,
              viewport: viewport.name,
              theme,
              path: key,
              classes: row?.classes ?? '',
              visible: row?.visible ?? false,
              property,
              before: a.get(property) ?? '(unset)',
              after: b.get(property) ?? '(unset)',
              kind: verdict.kind,
              rule: verdict.rule,
              other: verdict.other,
              winnerBefore: winBefore,
              winnerAfter: winAfter,
            });
          }
        }
      } finally {
        await Promise.all([before.close(), after.close()]);
      }
    }
  }
  return {
    findings,
    onlyBefore: [...onlyBefore],
    onlyAfter: [...onlyAfter],
    truncated,
    compared,
  };
}

/**
 * Launches Chromium, serves both builds, runs {@link comparePage} over every
 * page, and always tears the servers and browser down.
 *
 * @param {object} options - Run configuration.
 * @param {string} options.beforeDir - Reference `dist/`.
 * @param {string} options.afterDir - `dist/` under test.
 * @param {[number, number]} options.ports - Ports for before / after.
 * @param {string[]} options.pages - Site paths.
 * @param {typeof VIEWPORTS} options.viewports - Viewports.
 * @param {string[]} options.themes - Colour schemes.
 * @param {Classify} options.classify - Attribution hook.
 * @returns {Promise<{ results: Array<PageResult & { page: string }>, seconds: number }>}
 */
export async function runComparison({
  beforeDir,
  afterDir,
  ports,
  pages,
  viewports,
  themes,
  classify,
}) {
  const started = Date.now();
  const closers = [
    await serveDir(beforeDir, ports[0]),
    await serveDir(afterDir, ports[1]),
  ];
  const browser = await chromium.launch();
  const results = [];
  try {
    for (const [index, url] of pages.entries()) {
      const pageStarted = Date.now();
      const result = await comparePage({
        browser,
        beforeOrigin: `http://127.0.0.1:${ports[0]}`,
        afterOrigin: `http://127.0.0.1:${ports[1]}`,
        url,
        viewports,
        themes,
        classify,
      });
      results.push({ page: url, ...result });
      say(
        `[${index + 1}/${pages.length}] ${url} · ${result.findings.length} difference(s) · ${((Date.now() - pageStarted) / 1000).toFixed(1)} s`,
      );
    }
  } finally {
    await browser.close();
    await Promise.all(closers.map((close) => close()));
  }
  return { results, seconds: (Date.now() - started) / 1000 };
}

/**
 * Groups findings by the rule responsible (`rule.sheet` + media + selector, or
 * `derived` when no rule changed precedence on that element), so the report
 * reads as a fix list: one heading per rule, every property it moved under it.
 *
 * @param {object[]} findings - From {@link comparePage}.
 * @param {(finding: object) => string} fileOf - Source file a finding's rule came from.
 * @returns {object[]} Groups, worst (most findings) first within each file.
 */
export function groupFindings(findings, fileOf) {
  const groups = new Map();
  for (const finding of findings) {
    const rule = finding.rule;
    const id = rule
      ? `${finding.kind}\u0000${rule.sheet}\u0000${rule.media}\u0000${rule.selector}`
      : `${finding.kind}\u0000-`;
    let group = groups.get(id);
    if (!group) {
      group = {
        kind: finding.kind,
        file: fileOf(finding),
        sheet: rule?.sheet ?? null,
        media: rule?.media ?? '',
        selector: rule?.selector ?? null,
        counterparts: new Set(),
        properties: new Set(),
        pages: new Set(),
        elements: new Set(),
        count: 0,
        samples: [],
      };
      groups.set(id, group);
    }
    group.count += 1;
    group.properties.add(finding.property);
    group.pages.add(finding.page);
    group.elements.add(`${finding.page} ${finding.path}`);
    if (finding.other) {
      group.counterparts.add(
        `${finding.other.selector}${finding.other.media ? ` @media ${finding.other.media}` : ''} (${finding.other.sheet})`,
      );
    }
    if (group.samples.length < 12) group.samples.push(finding);
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      counterparts: [...g.counterparts].slice(0, 8),
      properties: [...g.properties].sort(),
      pages: [...g.pages].sort(),
      elements: g.elements.size,
    }))
    .sort(
      (a, b) =>
        String(a.file).localeCompare(String(b.file)) ||
        a.kind.localeCompare(b.kind) ||
        b.count - a.count,
    );
}

/** Escapes a value for a Markdown table cell. */
const cell = (value) =>
  String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 160);

/**
 * Renders the grouped findings as Markdown: a summary table per source file,
 * then one section per responsible rule with its sample differences in the
 * `page · viewport · theme · path · classes · property · before → after` shape.
 *
 * @param {object} options - Report content.
 * @param {string} options.title - H1.
 * @param {string[]} options.preamble - Paragraphs before the tables.
 * @param {object[]} options.groups - From {@link groupFindings}.
 * @param {Record<string, string>} options.kindNotes - Kind → one-line meaning.
 * @param {string[]} [options.appendix] - Extra Markdown lines at the end.
 * @returns {string} The Markdown document.
 */
export function renderMarkdown({
  title,
  preamble,
  groups,
  kindNotes,
  appendix = [],
}) {
  const lines = [`# ${title}`, '', ...preamble.flatMap((p) => [p, ''])];
  lines.push('## Kinds', '');
  for (const [kind, note] of Object.entries(kindNotes)) {
    lines.push(`- **${kind}** — ${note}`);
  }
  lines.push('', '## Summary by source file', '');
  lines.push('| Source file | Kind | Rules | Differences | Elements |');
  lines.push('|---|---|---:|---:|---:|');
  const byFile = new Map();
  for (const g of groups) {
    const id = `${g.file}\u0000${g.kind}`;
    const row = byFile.get(id) ?? {
      file: g.file,
      kind: g.kind,
      rules: 0,
      count: 0,
      elements: 0,
    };
    row.rules += 1;
    row.count += g.count;
    row.elements += g.elements;
    byFile.set(id, row);
  }
  for (const row of byFile.values()) {
    lines.push(
      `| ${cell(row.file)} | ${row.kind} | ${row.rules} | ${row.count} | ${row.elements} |`,
    );
  }
  let currentFile = null;
  for (const g of groups) {
    if (g.file !== currentFile) {
      currentFile = g.file;
      lines.push('', `## ${g.file}`);
    }
    const heading = g.selector
      ? `\`${g.selector}\`${g.media ? ` in \`@media ${g.media}\`` : ''}`
      : '(no rule changed precedence)';
    lines.push('', `### ${g.kind.toUpperCase()} · ${heading}`, '');
    if (g.sheet) lines.push(`- Stylesheet: \`${g.sheet}\``);
    if (g.counterparts.length) {
      lines.push(
        `- Competing rule(s): ${g.counterparts.map((c) => `\`${c}\``).join(', ')}`,
      );
    }
    lines.push(
      `- ${g.count} difference(s) on ${g.elements} element(s) across ${g.pages.length} page(s): ${g.pages.join(', ')}`,
      `- Properties: ${g.properties.map((p) => `\`${p}\``).join(', ')}`,
      '',
      '| page | viewport | theme | path | classes | property | before → after |',
      '|---|---|---|---|---|---|---|',
    );
    for (const s of g.samples) {
      lines.push(
        `| ${cell(s.page)} | ${s.viewport} | ${s.theme} | \`${cell(s.path)}\`${s.visible ? '' : ' (hidden)'} | ${cell(s.classes)} | \`${s.property}\` | \`${cell(s.before)}\` → \`${cell(s.after)}\` |`,
      );
    }
    if (g.count > g.samples.length) {
      lines.push(
        '',
        `…and ${g.count - g.samples.length} more in the JSON report.`,
      );
    }
  }
  lines.push('', ...appendix, '');
  return lines.join('\n');
}

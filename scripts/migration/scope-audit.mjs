/**
 * CSS scope audit (React migration plan §5 P1 steps 2–3, decision D-10, risk R2).
 *
 * THE QUESTION IT ANSWERS. The React build has no Astro scoping: every one of
 * the 30 scoped `<style>` blocks becomes a plain stylesheet. Dropping the
 * `[data-astro-cid-…]` qualifier changes the cascade in exactly two ways, and
 * both are silent:
 *
 * - **leak** — the rule now matches elements it never reached, because the
 *   qualifier was what fenced it to its own component (a `.bench p` that used
 *   to stop at the bench's own markup now styles slotted prose);
 * - **specificity** — the rule still matches the same element but lost one
 *   attribute selector's worth of specificity (0,1,0), so a rule it used to
 *   beat now beats it, or it no longer beats a global rule.
 *
 * Measuring that on the legacy artifact BEFORE any component is ported turns it
 * into a fix list. This script copies `.migration/baseline-dist` to
 * `.migration/stripped-dist`, removes every `data-astro-cid-*` attribute from
 * the HTML and every `[data-astro-cid-…]` part from the selectors in `<style>`
 * blocks and `_astro/*.css`, serves both builds, and compares the computed style
 * of every element with `lib/style-engine.mjs`. Each difference is attributed
 * to the scoped rule responsible, and that rule to its source `.astro` file
 * (the cid is a hash of the component's path; the Astro compiler is asked for
 * it, file by file, at the legacy commit).
 *
 * The stripped copy is the closest stand-in for "the same CSS, unscoped" that
 * exists without porting anything — which is the point: the audit is about the
 * cascade, not about any React code.
 *
 * Usage (the full run is the orchestrator's, on a quiet machine — plan §4):
 *
 *   nice -n 10 node scripts/migration/scope-audit.mjs            # full sample
 *   nice -n 10 node scripts/migration/scope-audit.mjs --smoke    # 1 page × 1 viewport × light
 *   node scripts/migration/scope-audit.mjs --pages /,/learn/arrays/
 *   node scripts/migration/scope-audit.mjs --help
 *
 * Output (gitignored): `.migration/scope-audit/report.md` (grouped by source
 * file → scoped rule → kind; what `docs/migrations/css-scope-audit.md` is
 * written from), `report.json` (every non-derived finding), `cid-map.json`.
 * Exits 0 whether or not differences are found; findings are the product.
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import {
  THEMES,
  VIEWPORTS,
  groupFindings,
  renderMarkdown,
  runComparison,
  say,
} from './lib/style-engine.mjs';
import {
  buildCidMap,
  defaultSample,
  fileOfSelector,
  parseCommonArgs,
  splitSelectorList,
} from './lib/audit-common.mjs';

/** Repository root, from this file's location (`scripts/migration/`). */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const BASELINE = path.join(ROOT, '.migration/baseline-dist');
const STRIPPED = path.join(ROOT, '.migration/stripped-dist');

/** Plan §5 P1 step 2: never 4321/4322, which the e2e suite owns. */
const DEFAULT_PORTS = [4501, 4502];

const USAGE = `scope-audit — computed-style diff of the legacy build vs the same build with Astro scoping stripped

  nice -n 10 node scripts/migration/scope-audit.mjs [--smoke] [--pages <a,b,…>] [--out <dir>] [--ports <p1,p2>]

  --smoke   /learn/binary-search/ only, desktop viewport, light theme (~1 min)
  --pages   comma-separated site paths instead of the plan's 38-page sample
  --out     output directory (default .migration/scope-audit)
  --ports   two ports for baseline / stripped (default ${DEFAULT_PORTS.join(',')})

Full run: 38 pages × 2 viewports × 2 themes = 152 comparisons. Measured on this
4-core machine under nice -n 10: a lesson page takes ~25 s per comparison
(~100 s for its four), /about/ 30 s for all four, /404.html 13 s — so expect
roughly 45–75 minutes. The cost is the computed-style capture (~1,300 elements ×
~570 properties per page, in both builds) plus one DevTools round trip per
differing element. Run it only when no other agent is building or testing. Writes report.md,
report.json and cid-map.json to the output directory.`;

/**
 * Normalizes a selector list or declaration block for lookup: whitespace runs
 * collapse, and whitespace around combinators, commas and braces disappears,
 * so source text and DevTools' text compare equal.
 *
 * @param {string} text - Selector or block text.
 * @returns {string} Normalized text.
 */
const norm = (text) =>
  text
    .replace(/\s+/g, ' ')
    .replace(/\s*([>+~,{};])\s*/g, '$1')
    .trim();

/**
 * {@link norm} for a selector, also dropping a universal `*` that only stands in
 * front of another simple selector: stripping `>[cid]:not(.x)` leaves
 * `>*:not(.x)`, which DevTools serializes as `>:not(.x)`.
 *
 * @param {string} selector - Selector list text.
 * @returns {string} Normalized selector.
 */
const normSelector = (selector) =>
  norm(selector).replace(/(^|[\s>+~,(])\*(?=[.:#[])/g, '$1');

/** A bare scoping attribute that IS the whole compound, e.g. `[cid] p` or `> [cid]`. */
const BARE_CID = /(^|[\s>+~,(])\[data-astro-cid-([a-z0-9]+)\]/g;
/** A scoping attribute qualifying a compound, e.g. `.bench[cid]`. */
const ATTACHED_CID = /\[data-astro-cid-([a-z0-9]+)\]/g;

/**
 * Removes the scoping attributes from every selector prelude in `css` (at-rule
 * preludes are untouched) and records, per rewritten rule, the original and
 * stripped selector together with its declaration block — the key that lets a
 * winning rule DevTools reports in the stripped build be traced back to the
 * scoped original. Quote- and comment-aware; the built CSS is flat (no nesting).
 *
 * @param {string} css - Stylesheet text.
 * @param {Map<string, object[]>} index - Stripped selector+block → originals.
 * @returns {string} The stylesheet without scoping.
 */
function stripCss(css, index) {
  let out = '';
  let start = 0;
  let quote = null;
  for (let i = 0; i < css.length; i += 1) {
    const c = css[i];
    if (quote) {
      if (c === '\\') i += 1;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '/' && css[i + 1] === '*') {
      const end = css.indexOf('*/', i + 2);
      i = end < 0 ? css.length : end + 1;
    } else if (c === '{') {
      const prelude = css.slice(start, i);
      if (
        prelude.trim().startsWith('@') ||
        !prelude.includes('data-astro-cid-')
      ) {
        out += css.slice(start, i + 1);
      } else {
        const cids = [...prelude.matchAll(ATTACHED_CID)].map((m) => m[1]);
        const stripped = prelude
          .replace(BARE_CID, '$1*')
          .replace(ATTACHED_CID, '');
        const close = css.indexOf('}', i);
        const block = css.slice(i + 1, close < 0 ? css.length : close);
        const key = `${normSelector(stripped)}{${norm(block)}`;
        const list = index.get(key) ?? [];
        list.push({
          original: prelude.trim(),
          stripped: stripped.trim(),
          cids,
        });
        index.set(key, list);
        out += `${stripped}{`;
      }
      start = i + 1;
    } else if (c === '}' || c === ';') {
      out += css.slice(start, i + 1);
      start = i + 1;
    }
  }
  return out + css.slice(start);
}

/**
 * Removes scoping from one HTML document: `<style>` contents through
 * {@link stripCss}, then every `data-astro-cid-*` attribute.
 *
 * @param {string} html - Document text.
 * @param {Map<string, object[]>} index - See {@link stripCss}.
 * @returns {string} The unscoped document.
 */
function stripHtml(html, index) {
  return html
    .replace(
      /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
      (_, open, css, close) => open + stripCss(css, index) + close,
    )
    .replace(/\s+data-astro-cid-[a-z0-9]+(?:="[^"]*")?/g, '');
}

/**
 * Rebuilds `.migration/stripped-dist` from the baseline and returns the index
 * of rewritten rules.
 *
 * @returns {{ index: Map<string, object[]>, cidsSeen: Set<string> }}
 */
function buildStripped() {
  rmSync(STRIPPED, { recursive: true, force: true });
  cpSync(BASELINE, STRIPPED, { recursive: true });
  const index = new Map();
  const cidsSeen = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const file = path.join(dir, entry);
      if (statSync(file).isDirectory()) {
        walk(file);
        continue;
      }
      if (!/\.(html|css)$/.test(entry)) continue;
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/data-astro-cid-([a-z0-9]+)/g))
        cidsSeen.add(m[1]);
      const stripped = entry.endsWith('.css')
        ? stripCss(text, index)
        : stripHtml(text, index);
      if (stripped.includes('data-astro-cid-')) {
        throw new Error(
          `scoping survived stripping in ${path.relative(ROOT, file)}`,
        );
      }
      writeFileSync(file, stripped);
    }
  };
  walk(STRIPPED);
  return { index, cidsSeen };
}

async function main() {
  const args = parseCommonArgs(process.argv.slice(2), DEFAULT_PORTS);
  if (args.help) {
    say(USAGE);
    return;
  }
  if (!existsSync(path.join(BASELINE, 'index.html'))) {
    throw new Error(
      `no legacy artifact at ${BASELINE} — plan §5 P0 step 2 preserves it there`,
    );
  }
  const out = path.resolve(ROOT, args.out ?? '.migration/scope-audit');
  mkdirSync(out, { recursive: true });

  say('stripping scoping into .migration/stripped-dist …');
  const { index, cidsSeen } = buildStripped();
  const cidMap = await buildCidMap(ROOT, path.join(out, 'cid-map.json'));
  const unmapped = [...cidsSeen].filter((cid) => !cidMap[cid]).sort();
  say(
    `${index.size} scoped rule(s) rewritten · ${cidsSeen.size} cid(s) in the build · ${unmapped.length} unmapped`,
  );

  const pages = args.smoke
    ? ['/learn/binary-search/']
    : (args.pages ?? defaultSample(ROOT));
  const viewports = args.smoke ? [VIEWPORTS[1]] : VIEWPORTS;
  const themes = args.smoke ? ['light'] : THEMES;
  say(
    `comparing ${pages.length} page(s) × ${viewports.length} viewport(s) × ${themes.length} theme(s) on ports ${args.ports.join('/')}`,
  );

  /**
   * Turns the two cascade winners for one property into a verdict. See the
   * file header for what leak and specificity mean.
   *
   * @type {import('./lib/style-engine.mjs').Classify}
   */
  const classify = async ({ key, before, after, beforeSide }) => {
    // Every scoped original that strips to this rule. Usually one; two
    // components can ship an identical rule body under the same class name, and
    // then the leak test below must ask about all of them.
    const records = after
      ? (index.get(`${normSelector(after.selector)}{${norm(after.block)}`) ??
        [])
      : [];
    const record =
      records.find(
        (r) => before && norm(r.original) === norm(before.selector),
      ) ?? records[0];
    const beforeScoped =
      !!before && before.selector.includes('data-astro-cid-');
    const sameRule =
      before &&
      after &&
      (record
        ? norm(record.original) === norm(before.selector)
        : norm(before.selector) === norm(after.selector) &&
          before.sheet === after.sheet);
    if ((!before && !after) || sameRule) {
      return { kind: 'derived', rule: null, other: null };
    }
    if (record) {
      const reached = await beforeSide.matches(
        key,
        records.flatMap((r) => splitSelectorList(r.original)),
      );
      const scopedRule = {
        ...after,
        selector: record.original,
        stripped: record.stripped,
      };
      if (!reached) return { kind: 'leak', rule: scopedRule, other: before };
      if (!beforeScoped)
        return { kind: 'specificity', rule: scopedRule, other: before };
    }
    // The stripped build's winner is named by its scoped original when it has
    // one, so the report says which component's rule took over.
    if (beforeScoped) {
      return {
        kind: 'specificity',
        rule: before,
        other: record ? { ...after, selector: record.original } : after,
      };
    }
    return {
      kind: 'other',
      rule: after ?? before,
      other: after ? before : null,
    };
  };

  const { results, seconds } = await runComparison({
    beforeDir: BASELINE,
    afterDir: STRIPPED,
    ports: args.ports,
    pages,
    viewports,
    themes,
    classify,
  });
  const findings = results.flatMap((r) => r.findings);
  const fileOf = (finding) =>
    finding.rule
      ? (fileOfSelector(finding.rule.selector, cidMap) ??
        `global CSS (${finding.rule.sheet})`)
      : '(derived — follows a change on an ancestor or a custom property)';
  const groups = groupFindings(findings, fileOf);
  const counts = Object.fromEntries(
    ['leak', 'specificity', 'other', 'derived'].map((k) => [
      k,
      findings.filter((f) => f.kind === k).length,
    ]),
  );
  const prefix = args.smoke ? 'smoke-' : '';
  writeFileSync(
    path.join(out, `${prefix}report.json`),
    `${JSON.stringify(
      {
        generatedBy: 'scripts/migration/scope-audit.mjs',
        seconds: Math.round(seconds),
        pages,
        viewports,
        themes,
        counts,
        unmappedCids: unmapped,
        structure: results.map((r) => ({
          page: r.page,
          compared: r.compared,
          truncated: r.truncated,
          onlyBefore: r.onlyBefore.length,
          onlyAfter: r.onlyAfter.length,
        })),
        groups: groups.map(({ samples, ...g }) => ({
          ...g,
          samples: samples.length,
        })),
        findings: findings.filter((f) => f.kind !== 'derived'),
      },
      null,
      1,
    )}\n`,
  );
  writeFileSync(
    path.join(out, `${prefix}report.md`),
    renderMarkdown({
      title: 'CSS scope audit — raw output',
      preamble: [
        `Generated by \`scripts/migration/scope-audit.mjs\` in ${Math.round(seconds)} s: ${pages.length} page(s) × ${viewports.map((v) => `${v.width}×${v.height}`).join(', ')} × ${themes.join('/')}, JavaScript off. Baseline \`.migration/baseline-dist\` vs \`.migration/stripped-dist\` (the same build with every \`data-astro-cid-*\` attribute and \`[data-astro-cid-…]\` selector part removed).`,
        `Differences: ${counts.leak} leak · ${counts.specificity} specificity · ${counts.other} other · ${counts.derived} derived. ${unmapped.length ? `Unmapped cids: ${unmapped.join(', ')}.` : 'Every cid in the build maps to a source file.'}`,
        'Each section below is one scoped rule: its ORIGINAL selector (with the cid), the stylesheet it ships in, the rule it now competes with, and sample differences. A fix is a rewritten selector that restores the original reach (leak) or precedence (specificity) without `!important` (plan §2.6).',
      ],
      groups,
      kindNotes: {
        leak: "the unscoped rule now wins on an element its scoped original did not match — narrow the selector (e.g. a child combinator or a class on the component's own markup).",
        specificity:
          "the element matched the scoped rule before too, but without the (0,1,0) attribute the cascade picks a different winner — raise the rewritten selector's specificity (e.g. qualify with the component root class).",
        other:
          'both winners are unscoped yet differ — should not happen; inspect by hand.',
        derived:
          "the same rule wins on both sides; the value moved because an ancestor's or a custom property's value moved. Fixing the leak/specificity rows above removes these.",
      },
      appendix: [
        '## Structure',
        '',
        '| page | entries compared | only in baseline | only in stripped | not attributed (cap) |',
        '|---|---:|---:|---:|---:|',
        ...results.map(
          (r) =>
            `| ${r.page} | ${r.compared} | ${r.onlyBefore.length} | ${r.onlyAfter.length} | ${r.truncated} |`,
        ),
      ],
    }),
  );
  say(
    `done in ${Math.round(seconds)} s · leak ${counts.leak} · specificity ${counts.specificity} · other ${counts.other} · derived ${counts.derived}`,
  );
  say(`report: ${path.relative(ROOT, path.join(out, `${prefix}report.md`))}`);
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});

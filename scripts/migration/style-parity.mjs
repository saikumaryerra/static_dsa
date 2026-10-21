/**
 * Style parity check (React migration plan §5 P1 step 4, used at the P3 exit;
 * risk R2).
 *
 * The scope audit (`scope-audit.mjs`) predicts what dropping Astro's scoping
 * would change and yields a fix list; this script checks the result. It serves
 * the frozen legacy artifact (`.migration/baseline-dist`) and a candidate
 * migrated `dist/` side by side and runs the same engine
 * (`lib/style-engine.mjs`): every rendered element's computed style, JS off, at
 * 390×844 and 1280×800, light and dark. A clean run is zero non-derived
 * differences on the sample; every row it does report names the rule that now
 * wins in the candidate, the legacy rule it replaced, and the source file a fix
 * goes into (`src/styles/…` for the candidate, the `.astro` file for the legacy
 * side).
 *
 * Elements are matched by DOM path with scripts, styles and `<head>` ignored,
 * so the migrated build moving its module scripts into `<head>` does not shift
 * anything. Structural drift — an element present in only one build — is listed
 * separately: it is a markup difference for the inventory's `mainHash` to
 * explain, not a style one.
 *
 * Usage (orchestrator, quiet machine — plan §4):
 *
 *   nice -n 10 node scripts/migration/style-parity.mjs <candidate-dist>            # plan sample
 *   nice -n 10 node scripts/migration/style-parity.mjs <candidate-dist> --all      # all 136 pages
 *   nice -n 10 node scripts/migration/style-parity.mjs <candidate-dist> --smoke
 *   node scripts/migration/style-parity.mjs --help
 *
 * Output (gitignored): `.migration/style-parity/report.{md,json}`. Exits 1 when
 * any non-derived difference or structural drift is found, so it can gate.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
  normalizeSelector,
  parseCommonArgs,
  sourceSelectorIndex,
} from './lib/audit-common.mjs';

/** Repository root, from this file's location (`scripts/migration/`). */
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../..',
);

const BASELINE = path.join(ROOT, '.migration/baseline-dist');

/** Not 4321/4322 (e2e) and not the scope audit's 4501/4502. */
const DEFAULT_PORTS = [4503, 4504];

const USAGE = `style-parity — computed-style diff of the legacy build vs a migrated dist/

  nice -n 10 node scripts/migration/style-parity.mjs <candidate-dist> [--smoke | --all | --pages <a,b,…>] [--out <dir>] [--ports <p1,p2>]

  <candidate-dist>  the migrated build, e.g. dist or /tmp/ws-c/dist
  --smoke   /learn/binary-search/ only, desktop viewport, light theme (~1 min)
  --all     every route in the baseline inventory (136 pages; ~4–6 hours)
  --pages   comma-separated site paths instead of the plan's 38-page sample
  --out     output directory (default .migration/style-parity)
  --ports   two ports for baseline / candidate (default ${DEFAULT_PORTS.join(',')})

Default run: the scope audit's 38-page sample × 2 viewports × 2 themes = 152
comparisons, roughly 45–75 minutes on a quiet 4-core machine (same engine and
cost as scope-audit.mjs). Run it only when no other agent is building or
testing. Exits 1 on any non-derived difference or structural drift.`;

async function main() {
  const args = parseCommonArgs(process.argv.slice(2), DEFAULT_PORTS);
  if (args.help) {
    say(USAGE);
    return;
  }
  const [candidateArg] = args.positional;
  if (!candidateArg) throw new Error('missing <candidate-dist> (see --help)');
  const candidate = path.resolve(ROOT, candidateArg);
  for (const dir of [BASELINE, candidate]) {
    if (!existsSync(path.join(dir, 'index.html'))) {
      throw new Error(`no built site at ${dir}`);
    }
  }
  const out = path.resolve(ROOT, args.out ?? '.migration/style-parity');
  mkdirSync(out, { recursive: true });

  const cidMap = await buildCidMap(ROOT, path.join(out, 'cid-map.json'));
  const sources = sourceSelectorIndex(ROOT);
  const inventory = JSON.parse(
    readFileSync(
      path.join(ROOT, 'docs/migrations/react-migration-inventory.json'),
      'utf8',
    ),
  );
  const pages = args.smoke
    ? ['/learn/binary-search/']
    : (args.pages ??
      (args.all ? inventory.routes.map((r) => r.url) : defaultSample(ROOT)));
  const viewports = args.smoke ? [VIEWPORTS[1]] : VIEWPORTS;
  const themes = args.smoke ? ['light'] : THEMES;
  say(
    `comparing ${pages.length} page(s) × ${viewports.length} viewport(s) × ${themes.length} theme(s): ${path.relative(ROOT, BASELINE)} vs ${path.relative(ROOT, candidate) || '.'}`,
  );

  /**
   * Same winning rule on both sides (modulo Astro's scoping) means the value
   * moved because something upstream did — derived. Anything else is a rule
   * that now wins where a different one used to.
   *
   * @type {import('./lib/style-engine.mjs').Classify}
   */
  const classify = async ({ before, after }) => {
    const same =
      (!before && !after) ||
      (before &&
        after &&
        normalizeSelector(before.selector) ===
          normalizeSelector(after.selector) &&
        before.media === after.media);
    if (same) return { kind: 'derived', rule: null, other: null };
    return {
      kind: 'rule-changed',
      rule: after ?? before,
      other: after ? before : null,
    };
  };

  const { results, seconds } = await runComparison({
    beforeDir: BASELINE,
    afterDir: candidate,
    ports: args.ports,
    pages,
    viewports,
    themes,
    classify,
  });

  const findings = results.flatMap((r) => r.findings);
  /** Where a fix goes: the candidate's source stylesheet, else the legacy component. */
  const fileOf = (finding) => {
    if (!finding.rule) {
      return '(derived — follows a change on an ancestor or a custom property)';
    }
    const fromSource = sources.get(normalizeSelector(finding.rule.selector));
    if (fromSource && finding.rule === finding.winnerAfter) {
      return fromSource.join(' + ');
    }
    return (
      fileOfSelector(finding.winnerBefore?.selector ?? '', cidMap) ??
      `global CSS (${finding.rule.sheet})`
    );
  };
  const groups = groupFindings(findings, fileOf);
  const counts = {
    'rule-changed': findings.filter((f) => f.kind === 'rule-changed').length,
    derived: findings.filter((f) => f.kind === 'derived').length,
  };
  const drift = results.filter(
    (r) => r.onlyBefore.length || r.onlyAfter.length,
  );
  const prefix = args.smoke ? 'smoke-' : '';
  writeFileSync(
    path.join(out, `${prefix}report.json`),
    `${JSON.stringify(
      {
        generatedBy: 'scripts/migration/style-parity.mjs',
        candidate: path.relative(ROOT, candidate) || '.',
        seconds: Math.round(seconds),
        pages,
        viewports,
        themes,
        counts,
        structure: results.map((r) => ({
          page: r.page,
          compared: r.compared,
          truncated: r.truncated,
          onlyBefore: r.onlyBefore,
          onlyAfter: r.onlyAfter,
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
      title: 'Style parity — raw output',
      preamble: [
        `Generated by \`scripts/migration/style-parity.mjs\` in ${Math.round(seconds)} s: ${pages.length} page(s) × ${viewports.map((v) => `${v.width}×${v.height}`).join(', ')} × ${themes.join('/')}, JavaScript off. Baseline \`.migration/baseline-dist\` vs \`${path.relative(ROOT, candidate) || '.'}\`.`,
        `Differences: ${counts['rule-changed']} rule-changed · ${counts.derived} derived. Pages with structural drift: ${drift.length}.`,
      ],
      groups,
      kindNotes: {
        'rule-changed':
          'a different rule wins in the candidate than in the legacy build — the section names the candidate rule (heading) and the legacy rule it replaced ("competing").',
        derived:
          "the same rule wins on both sides; the value moved because an ancestor's or a custom property's value moved.",
      },
      appendix: [
        '## Structure',
        '',
        'Element keys present in only one build (first 10 per page; all in the JSON).',
        '',
        '| page | entries compared | only in baseline | only in candidate | not attributed (cap) |',
        '|---|---:|---:|---:|---:|',
        ...results.map(
          (r) =>
            `| ${r.page} | ${r.compared} | ${r.onlyBefore.length} | ${r.onlyAfter.length} | ${r.truncated} |`,
        ),
        '',
        ...drift.flatMap((r) => [
          `- ${r.page}: baseline only ${r.onlyBefore
            .slice(0, 10)
            .map((k) => `\`${k}\``)
            .join(', ')}; candidate only ${r.onlyAfter
            .slice(0, 10)
            .map((k) => `\`${k}\``)
            .join(', ')}`,
        ]),
      ],
    }),
  );
  say(
    `done in ${Math.round(seconds)} s · rule-changed ${counts['rule-changed']} · derived ${counts.derived} · drift on ${drift.length} page(s)`,
  );
  say(`report: ${path.relative(ROOT, path.join(out, `${prefix}report.md`))}`);
  if (counts['rule-changed'] > 0 || drift.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});

/**
 * Content validator for the course expansion (docs/courses/SPEC.md Appendix D).
 *
 * Reads `src/content/lessons/*.mdx` off disk and checks everything about a
 * lesson that a machine can check: metadata, ordering, placeholders, section
 * shape, word count, internal links, diagrams, code fences, Kubernetes API
 * versions, and the Appendix A/B coverage map.
 *
 * WHY IT READS THE FILESYSTEM rather than the content collection: it runs in two
 * places — `npm run validate:content` and a Vitest suite — and Vitest runs
 * `environment: 'node'` with no Astro module graph, so `getCollection()` is not
 * available to it. Parsing the frontmatter here is the same thing three existing
 * test files already do (`tests/unit/challenges.test.ts`,
 * `tests/unit/glossary-anchors.test.ts`, `tests/e2e/m8-explain-note.spec.ts`).
 *
 * SCOPE. Structural rules — placeholders, link resolution, fenced-code
 * languages, YAML, the API allowlist — apply to EVERY published lesson. The
 * section shape and the word bounds apply only to the two new courses: the
 * fifteen algorithm lessons predate them, follow the older six-heading contract
 * from spec §7, and are not this expansion's to restyle (SPEC §2, "preserve").
 *
 * SPEC-GAP (spec §4, "no dependencies beyond §4"): this module imports `yaml`,
 * added as a **devDependency**. It parses the YAML inside lesson code fences so
 * a manifest that would not apply fails the build. The alternatives were a
 * hand-rolled YAML subset parser — a wheel worth reinventing only if it is
 * correct, and this one would have to handle block scalars, anchors and flow
 * collections to be — or reaching into a transitive copy hoisted into
 * `node_modules` by luck. It ships **zero bytes to the browser**: nothing in
 * `src/` imports it, and it is used only by this validator and its test.
 */
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';

/** Difficulty values the lesson schema allows (decision D-06). */
const DIFFICULTIES = ['beginner', 'intermediate'];

/** Course ids, in catalogue order. Mirrors `src/lib/courses.ts`. */
const COURSES = ['dsa', 'kubernetes', 'system-design'];

/** The two courses this expansion authors, and whose contract §2 defines. */
const NEW_COURSES = ['kubernetes', 'system-design'];

/** Required `##` headings for a new-course lesson, in order (decision D-10). */
const REQUIRED_SECTIONS = [
  "What you'll learn",
  'Intuition',
  'How it works',
  'Key takeaways',
  'Practice',
];

/** Optional `##` headings. Present is fine; present and empty is not. */
const OPTIONAL_SECTIONS = ['Trade-offs', 'Common pitfalls', 'Interview notes'];

/** Prose-word bounds for a new-course lesson (SPEC §5 sizing). */
const WORD_FLOOR = 600;
const WORD_CEILING = 1500;

/**
 * Lessons allowed to run past the ceiling — SPEC §5: "Projects and
 * troubleshooting scenarios may run longer."
 */
const LONG_FORM_TRACKS = ['k8s-projects', 'k8s-troubleshooting'];

/**
 * Placeholder markers (Appendix D item 3), as regexes rather than substrings.
 *
 * The naive version — case-insensitive `String.includes` on each phrase — reads
 * "which is why it has to be written down" as unfinished content, and would have
 * done the same to any sentence containing the word "placeholder". A guard that
 * cries wolf gets switched off, so each phrase is matched in the shape a
 * placeholder actually takes:
 *
 * - The acronyms are matched **uppercase, as whole words**. Nobody writes a
 *   marker as "todo" in a sentence, and `TBD` cannot collide with prose.
 * - `lorem ipsum`, `coming soon` and `[...]` are unambiguous in any case.
 * - The three that are also ordinary English — "placeholder", "to be written",
 *   "insert here" — count only when they are **bracketed, emphasised, or the
 *   whole line**, which is how someone marks a hole they mean to come back to.
 */
const PLACEHOLDERS = [
  /\bTODO\b/,
  /\bTBD\b/,
  /\bFIXME\b/,
  /\bXXX\b/,
  /lorem ipsum/i,
  /coming soon/i,
  /\[\.\.\.\]/,
  /[[(*_]{1,2}\s*(placeholder|to be written|insert here)[^\n]{0,20}?[\])*_]{1,2}/i,
  /^\s*(placeholder|to be written|insert here)[\s.!]*$/im,
];

/**
 * `apiVersion` → allowed `kind`s (DECISIONS D-02, verified against the upstream
 * deprecation guide on 2026-08-26).
 */
const API_ALLOWLIST = {
  v1: [
    'Pod',
    'Service',
    'ConfigMap',
    'Secret',
    'PersistentVolume',
    'PersistentVolumeClaim',
    'ServiceAccount',
    'Namespace',
    'Node',
    'Endpoints',
    'LimitRange',
    'ResourceQuota',
    'Event',
    'List',
  ],
  'apps/v1': [
    'Deployment',
    'StatefulSet',
    'DaemonSet',
    'ReplicaSet',
    'ControllerRevision',
  ],
  'batch/v1': ['Job', 'CronJob'],
  'networking.k8s.io/v1': ['Ingress', 'IngressClass', 'NetworkPolicy'],
  'autoscaling/v2': ['HorizontalPodAutoscaler'],
  'policy/v1': ['PodDisruptionBudget'],
  'rbac.authorization.k8s.io/v1': [
    'Role',
    'RoleBinding',
    'ClusterRole',
    'ClusterRoleBinding',
  ],
  'storage.k8s.io/v1': [
    'StorageClass',
    'VolumeAttachment',
    'CSIDriver',
    'CSINode',
    'CSIStorageCapacity',
  ],
  'scheduling.k8s.io/v1': ['PriorityClass'],
  'admissionregistration.k8s.io/v1': [
    'ValidatingWebhookConfiguration',
    'MutatingWebhookConfiguration',
    'ValidatingAdmissionPolicy',
    'ValidatingAdmissionPolicyBinding',
  ],
  'discovery.k8s.io/v1': ['EndpointSlice'],
  'gateway.networking.k8s.io/v1': [
    'GatewayClass',
    'Gateway',
    'HTTPRoute',
    'GRPCRoute',
  ],
  'apiextensions.k8s.io/v1': ['CustomResourceDefinition'],
  'apiregistration.k8s.io/v1': ['APIService'],
  'snapshot.storage.k8s.io/v1': [
    'VolumeSnapshot',
    'VolumeSnapshotClass',
    'VolumeSnapshotContent',
  ],

  // ---- ECOSYSTEM, not core Kubernetes ----
  //
  // These are not served by the Kubernetes API at all: two are tool
  // configuration files that never reach a cluster, and the rest are CRDs a
  // reader installs. They are here because the curriculum genuinely teaches
  // them — a local-cluster lesson that cannot show a multi-node `kind` config,
  // or a Kustomize lesson that cannot show a `kustomization.yaml`, is teaching
  // around its own subject. CONTENT_STYLE §8 still requires each to be labelled
  // as ecosystem in the prose; this list only says the YAML is not a mistake.
  //
  // Verified current on 2026-08-26. `v1alpha1`/`v1alpha4` are the versions these
  // projects actually ship, not stale ones — unlike the Kubernetes `v1beta`
  // entries on the deny list below, which are removed.
  'kind.x-k8s.io/v1alpha4': ['Cluster'], // the kind CLI's config file
  'kustomize.config.k8s.io/v1beta1': ['Kustomization', 'Component'],
  'argoproj.io/v1alpha1': ['Application', 'ApplicationSet', 'AppProject'],
  'keda.sh/v1alpha1': ['ScaledObject', 'ScaledJob', 'TriggerAuthentication'],
  'kyverno.io/v1': ['ClusterPolicy', 'Policy'],
  'monitoring.coreos.com/v1': [
    'ServiceMonitor',
    'PodMonitor',
    'PrometheusRule',
    'Prometheus',
  ],
};

/** API versions that are removed or deprecated — never valid (DECISIONS D-02). */
const API_DENYLIST = [
  'extensions/v1beta1',
  'apps/v1beta1',
  'apps/v1beta2',
  'batch/v1beta1',
  'networking.k8s.io/v1beta1',
  'autoscaling/v2beta1',
  'autoscaling/v2beta2',
  'policy/v1beta1',
  'rbac.authorization.k8s.io/v1beta1',
  'storage.k8s.io/v1beta1',
  'admissionregistration.k8s.io/v1beta1',
  'flowcontrol.apiserver.k8s.io/v1beta1',
  'flowcontrol.apiserver.k8s.io/v1beta2',
  'flowcontrol.apiserver.k8s.io/v1beta3',
  'scheduling.k8s.io/v1beta1',
  'apiextensions.k8s.io/v1beta1',
];

/**
 * Components bound to the algorithm-trace pipeline. A new-course lesson may not
 * use one: `Visualizer`, `Challenge`, `FinalRun` and `StepLink` all resolve an
 * id against `src/viz/registry.ts` or `src/lib/challenges.ts` at build time, and
 * `ComplexityTable` renders a frontmatter field these lessons deliberately omit.
 *
 * This rule is also what lets three e2e walks scope themselves to the `dsa`
 * course instead of navigating to every lesson in the catalogue: they can only
 * skip the other courses safely because nothing they look for can be there.
 */
const VIZ_COUPLED = [
  'Visualizer',
  'Challenge',
  'FinalRun',
  'StepLink',
  'ComplexityTable',
];

/**
 * CONTENT_STYLE §1's ban list, split by how certain the call is.
 *
 * It was a rule nothing checked, so three reviewers found it by hand in three
 * modules — which is the definition of a rule that belongs in a test. This repo
 * already enforces its calm-vocabulary rules the same way (see the banned-word
 * regexes in `tests/unit/challenges.test.ts` and `tests/unit/mastery-ui.test.ts`).
 *
 * ALWAYS is filler or marketing: there is no sentence these improve.
 * SOMETIMES has honest uses — "easier to packet-capture than X" is a real
 * comparison, "just before the probe fires" is ordinary English — so those warn
 * and a human decides, rather than provoking a fight with the checker.
 */
const BANNED_ALWAYS =
  /\b(simply|seamless(?:ly)?|leverage[sd]?|utili[sz]e[sd]?|cutting-edge|effortless(?:ly)?|robust|powerful)\b/i;
const BANNED_SOMETIMES = /\b(just|easy|easier|easily)\b/i;

/**
 * Figures that were corrected after lessons had already reused them.
 *
 * `sd-capacity-estimation` is the single source for this course's worked
 * numbers, and five later lessons quote them. When a review corrected that
 * lesson mid-run — a divisor, and a video ladder whose assumptions could not
 * both hold — three lessons that had faithfully copied the old values silently
 * disagreed with it. Nothing failed; the course simply contradicted itself in
 * three places.
 *
 * A general cross-lesson consistency checker is not worth building, but a
 * denylist of values *known to be wrong* is cheap and exact. Add a row whenever
 * a shared figure changes, and the next reuse of the old one fails instead of
 * shipping.
 *
 * MATCH THE SPELLED-OUT FORM TOO. The first version of this list matched digits
 * only, and "Fifteen petabytes a year" walked straight past it into a lesson
 * whose own fence three lines above said 36 PB — a reviewer found it by hand,
 * which is the work this list exists to save.
 */
const STALE_FIGURES = [
  [/18,000 (?:reads|redirects)/, '15,000 — the link-shortener peak read rate'],
  [/600 Gbps/, '540 Gbps — the video-platform average egress'],
  [/\b15 PB\b|fifteen petabytes/i, '36 PB — the video-platform yearly storage'],
  [
    /40 TB\/day|forty terabytes a day/i,
    '100 TB/day — the video-platform daily storage',
  ],
  [
    /six hundred Gbps|\b600 Gbps\b/i,
    '540 Gbps — the video-platform average egress',
  ],
  [
    /eighteen thousand (?:reads|redirects)/i,
    '15,000 — the link-shortener peak read rate',
  ],
  [/2,300 reads/, '2,000 — the workflow example at 100,000 s/day'],
  [/7,000 reads/, '6,000 — the workflow example peak at 100,000 s/day'],
];

/**
 * The characters the committed webfont subsets actually draw.
 *
 * `public/fonts/*.woff2` are cut to exactly the characters this repo contains,
 * so a lesson that introduces a new glyph either needs `npm run fonts` re-run and
 * the subsets recommitted, or needs the glyph replaced. `tests/unit/font-charset.test.ts`
 * already enforces this — but it runs in `npm run test`, which an author writing
 * a lesson does not, so two box-drawing characters reached committed content
 * before anyone noticed. Checking it here moves the failure to the person who
 * can fix it in one keystroke.
 *
 * Read out of the generated file rather than re-derived, so there is one source.
 *
 * @param {string} root - Repository root.
 * @returns {Set<string>} Every covered character.
 */
function fontCharset(root) {
  const source = readFileSync(
    path.join(root, 'src', 'styles', 'font-charset.ts'),
    'utf8',
  );
  const line = source
    .split('\n')
    .find((l) => l.startsWith('export const FONT_CHARSET'));
  if (!line) return new Set();
  const literal = line
    .slice(line.indexOf('=') + 1)
    .trim()
    .replace(/;$/, '');
  try {
    return new Set(JSON.parse(literal));
  } catch {
    return new Set();
  }
}

/** Non-lesson internal paths a lesson may link to. */
const STATIC_PATHS = ['/', '/learn/', '/glossary/', '/about/'];

/**
 * Reads one YAML scalar out of a frontmatter block.
 *
 * Deliberately narrow: it accepts a quoted or bare scalar on one line and
 * returns `null` for anything else, including a block scalar — the same stance
 * `tests/e2e/m8-explain-note.spec.ts` takes, and the reason CONTENT_STYLE.md
 * requires single-quoted scalars.
 *
 * @param {string} block - The frontmatter body, without the `---` fences.
 * @param {string} key - The key to read.
 * @returns {string | null} The scalar, or `null` when absent or multi-line.
 */
function scalar(block, key) {
  const line = block.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  if (!line) return null;
  const raw = (line[1] ?? '').trim();
  if (raw === '' || raw === '>' || raw === '|') return null;
  const quoted = raw.match(/^'(.*)'$/s) ?? raw.match(/^"(.*)"$/s);
  return quoted ? (quoted[1] ?? '') : raw;
}

/**
 * Strips fenced code, MDX component tags and import lines, leaving prose.
 *
 * @param {string} body - The MDX body (frontmatter already removed).
 * @returns {string} Prose only.
 */
function proseOf(body) {
  return body
    .replace(/^import .*$/gm, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, ' ');
}

/**
 * Counts the words of a lesson's TEACHING prose — what SPEC §5's 600–1,500 band
 * is about.
 *
 * Two things are excluded, both because counting them measured the wrong thing:
 *
 * - **A token with no letter or digit is not a word.** A markdown table's cell
 *   separators are five `|` per row, so a thirteen-row table contributed eighty
 *   "words" of punctuation and the ceiling became a tax on tables.
 * - **`<PracticeCheck>` answers are not reading prose.** They ship collapsed,
 *   the reader opens them after working the question out, and the site's own
 *   model already treats them separately: CONTENT_STYLE §3 computes
 *   `estimatedMinutes` as reading time *plus* exercise time. Counting them
 *   inside the reading budget cost every lesson about 300 words of teaching —
 *   measured across the first nineteen, teaching prose ran 945–1,485 words while
 *   the totals ran 1,160–1,852, and one author landed on *exactly* 1,500, which
 *   is a metric shaping the writing rather than checking it.
 *
 * This is not a relaxation. The 600-word floor now applies to teaching prose
 * too, where before a lesson could reach it on practice answers alone.
 *
 * @param {string} body - The MDX body.
 * @returns {number} Teaching-prose word count.
 */
function wordCount(body) {
  return proseOf(body.replace(/<PracticeCheck[\s\S]*?<\/PracticeCheck>/g, ''))
    .replace(/`[^`]*`/g, '')
    .split(/\s+/)
    .filter((token) => /[A-Za-z0-9]/.test(token)).length;
}

/**
 * Every fenced code block in a body.
 *
 * @param {string} body - The MDX body.
 * @returns {{ lang: string, code: string, line: number }[]} The blocks.
 */
function fences(body) {
  /** @type {{ lang: string, code: string, line: number }[]} */
  const out = [];
  const re = /^```([^\n`]*)\n([\s\S]*?)^```/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    out.push({
      lang: (m[1] ?? '').trim(),
      code: m[2] ?? '',
      line: body.slice(0, m.index).split('\n').length,
    });
  }
  return out;
}

/**
 * The `##` headings of a body, in document order.
 *
 * @param {string} body - The MDX body.
 * @returns {{ title: string, index: number }[]} Headings with their offsets.
 */
function sections(body) {
  /** @type {{ title: string, index: number }[]} */
  const out = [];
  const re = /^##[ \t]+(.+?)[ \t]*$/gm;
  let m;
  while ((m = re.exec(body)) !== null) {
    out.push({ title: (m[1] ?? '').trim(), index: m.index });
  }
  return out;
}

/**
 * Validates every published lesson and the Appendix coverage map.
 *
 * @param {string} root - Repository root.
 * @param {{ strict?: boolean }} [options] - `strict` promotes a PENDING coverage
 * topic — one whose lesson is planned but not yet written — from a warning to an
 * error. The authoring pass and the unit suite run non-strict, so a commit that
 * lands one finished module does not fail on the thirteen still to come (SPEC §4:
 * never leave the tree broken at a commit boundary). CI and the §8 gate run
 * strict, which is what makes "every Appendix topic is taught" a checked claim
 * rather than a remembered one.
 * @returns {{ errors: string[], warnings: string[], pending: string[], checked: number }} Findings.
 */
export function validateContent(root, options = {}) {
  const strict = options.strict === true;
  /** @type {string[]} */
  const errors = [];
  /** @type {string[]} */
  const warnings = [];
  /** Topics whose lesson is planned in CURRICULUM.md but not yet written. */
  /** @type {string[]} */
  const pending = [];

  const covered = fontCharset(root);
  const dir = path.join(root, 'src', 'content', 'lessons');
  const files = readdirSync(dir).filter((f) => f.endsWith('.mdx'));

  /** @type {{ file: string, data: Record<string, string|null>, body: string }[]} */
  const lessons = [];

  for (const file of files) {
    const raw = readFileSync(path.join(dir, file), 'utf8');
    const fm = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!fm) {
      errors.push(`${file}: no frontmatter block`);
      continue;
    }
    const block = fm[1] ?? '';
    const body = fm[2] ?? '';
    const data = {
      title: scalar(block, 'title'),
      slug: scalar(block, 'slug'),
      course: scalar(block, 'course') ?? 'dsa',
      track: scalar(block, 'track'),
      order: scalar(block, 'order'),
      summary: scalar(block, 'summary'),
      difficulty: scalar(block, 'difficulty'),
      estimatedMinutes: scalar(block, 'estimatedMinutes'),
      published: scalar(block, 'published'),
      explainPrompt: scalar(block, 'explainPrompt'),
      // Presence only: the field is a nested map, so `scalar` cannot read it.
      hasComplexity: /^complexity:/m.test(block) ? 'yes' : null,
    };
    if (data.published !== 'true') continue;
    lessons.push({ file, data, body });
  }

  const published = new Set(
    lessons.map((l) => l.data.slug).filter((s) => typeof s === 'string'),
  );

  // --- 1. metadata -------------------------------------------------------
  for (const { file, data } of lessons) {
    for (const key of [
      'title',
      'slug',
      'track',
      'order',
      'summary',
      'difficulty',
      'estimatedMinutes',
    ]) {
      if (!data[key]) errors.push(`${file}: missing frontmatter \`${key}\``);
    }
    if (data.difficulty && !DIFFICULTIES.includes(data.difficulty)) {
      errors.push(
        `${file}: difficulty "${data.difficulty}" is not one of ${DIFFICULTIES.join(', ')}`,
      );
    }
    if (data.course && !COURSES.includes(data.course)) {
      errors.push(`${file}: course "${data.course}" is not a known course`);
    }
    if (data.slug && !/^[a-z0-9-]+$/.test(data.slug)) {
      errors.push(`${file}: slug "${data.slug}" is not kebab-case`);
    }
    if (data.slug && data.slug !== file.replace(/\.mdx$/, '')) {
      errors.push(`${file}: filename must match the slug "${data.slug}"`);
    }
    for (const key of ['order', 'estimatedMinutes']) {
      const value = data[key];
      if (value !== null && !/^\d+$/.test(value)) {
        errors.push(`${file}: \`${key}\` must be a positive integer`);
      }
    }
    if (data.explainPrompt !== null && data.explainPrompt.trim() === '') {
      errors.push(`${file}: \`explainPrompt\` is present but empty`);
    }
    if (NEW_COURSES.includes(data.course ?? '') && data.hasComplexity) {
      errors.push(
        `${file}: \`complexity\` is a Big-O claim and belongs only to an algorithm lesson (decision D-07)`,
      );
    }
  }

  // --- 2. unique slugs, contiguous order per course ----------------------
  /** @type {Map<string, string[]>} */
  const bySlug = new Map();
  for (const { file, data } of lessons) {
    if (!data.slug) continue;
    bySlug.set(data.slug, [...(bySlug.get(data.slug) ?? []), file]);
  }
  for (const [slug, where] of bySlug) {
    if (where.length > 1) {
      errors.push(`duplicate slug "${slug}" in ${where.join(' and ')}`);
    }
  }
  for (const course of COURSES) {
    const inCourse = lessons.filter((l) => l.data.course === course);
    if (inCourse.length === 0) continue;
    const byOrder = [...inCourse].sort(
      (a, b) => Number(a.data.order) - Number(b.data.order),
    );
    const orders = byOrder.map((l) => Number(l.data.order));
    const expected = orders.map((_, i) => i + 1);
    if (orders.join(',') !== expected.join(',')) {
      errors.push(
        `course "${course}": \`order\` must be contiguous from 1 — got ${orders.join(', ')}`,
      );
    }

    // A module's lessons must form ONE contiguous block of `order`. The home
    // page derives a course's module list from the order its lessons appear in,
    // so a lesson placed outside its module's block silently reorders — or
    // duplicates — a row on the landing page, with nothing on screen looking
    // broken enough to notice.
    /** @type {string[]} */
    const blocks = [];
    for (const lesson of byOrder) {
      const track = lesson.data.track ?? '';
      if (blocks[blocks.length - 1] !== track) blocks.push(track);
    }
    const repeated = blocks.filter((t, i) => blocks.indexOf(t) !== i);
    if (repeated.length > 0) {
      errors.push(
        `course "${course}": module(s) ${[...new Set(repeated)].join(', ')} are split across non-adjacent \`order\` ranges — each module must be one contiguous block`,
      );
    }
  }

  // --- 3..8, per lesson --------------------------------------------------
  for (const { file, data, body } of lessons) {
    const isNew = NEW_COURSES.includes(data.course ?? 'dsa');

    // 3. placeholders
    for (const marker of PLACEHOLDERS) {
      const hit = marker.exec(body);
      if (hit) {
        const line = body.slice(0, hit.index).split('\n').length;
        errors.push(
          `${file}:${line}: placeholder marker ${JSON.stringify(hit[0].trim())}`,
        );
      }
    }

    const found = sections(body);
    const titles = found.map((s) => s.title);

    // 4. required and optional sections
    if (isNew) {
      for (const name of REQUIRED_SECTIONS) {
        if (!titles.includes(name)) {
          errors.push(`${file}: missing required section "## ${name}"`);
        }
      }
      const order = REQUIRED_SECTIONS.filter((n) => titles.includes(n)).map(
        (n) => titles.indexOf(n),
      );
      if (order.join(',') !== [...order].sort((a, b) => a - b).join(',')) {
        errors.push(
          `${file}: required sections are out of order — expected ${REQUIRED_SECTIONS.join(' → ')}`,
        );
      }
      for (const title of titles) {
        if (
          !REQUIRED_SECTIONS.includes(title) &&
          !OPTIONAL_SECTIONS.includes(title)
        ) {
          errors.push(
            `${file}: unexpected section "## ${title}" — the allowed set is in docs/courses/CONTENT_STYLE.md §2`,
          );
        }
      }
    }
    for (let i = 0; i < found.length; i++) {
      const start = found[i].index + found[i].title.length + 3;
      const end = i + 1 < found.length ? found[i + 1].index : body.length;
      if (proseOf(body.slice(start, end)).trim().length < 20) {
        errors.push(`${file}: section "## ${found[i].title}" is empty`);
      }
    }

    // 5. word count
    if (isNew) {
      const words = wordCount(body);
      if (words < WORD_FLOOR) {
        errors.push(
          `${file}: ${words} prose words, below the ${WORD_FLOOR}-word floor`,
        );
      } else if (
        words > WORD_CEILING &&
        !LONG_FORM_TRACKS.includes(data.track)
      ) {
        warnings.push(
          `${file}: ${words} prose words, above the ${WORD_CEILING}-word ceiling`,
        );
      }
    }

    // 5f. every glyph must be one the committed font subsets draw
    if (covered.size > 0) {
      /** @type {Set<string>} */
      const unseen = new Set();
      for (const ch of body) {
        const cp = ch.codePointAt(0) ?? 0;
        if (cp >= 0x21 && cp <= 0xffff && !covered.has(ch)) unseen.add(ch);
      }
      for (const ch of unseen) {
        errors.push(
          `${file}: ${JSON.stringify(ch)} (U+${(ch.codePointAt(0) ?? 0).toString(16).toUpperCase().padStart(4, '0')}) is outside the committed font subsets — use a covered character, or re-run \`npm run fonts\` and commit public/fonts/*.woff2 with the regenerated src/styles/font-charset.ts`,
        );
      }
    }

    // 5e. figures superseded by a correction to their source lesson
    for (const [pattern, correction] of STALE_FIGURES) {
      const hit = pattern.exec(body);
      if (hit) {
        const line = body.slice(0, hit.index).split('\n').length;
        errors.push(
          `${file}:${line}: ${JSON.stringify(hit[0])} was superseded — use ${correction}`,
        );
      }
    }

    // 5d. CONTENT_STYLE §1's ban list, over prose only — a flag or an
    // identifier in a code fence is not the author's word choice.
    //
    // NEW COURSES ONLY, like the section and word rules above. Four of the
    // fifteen algorithm lessons trip it ("simply" in three, "powerful" in one);
    // they predate CONTENT_STYLE and rewording shipped prose is not what this
    // expansion was asked to do (SPEC §2, "preserve"). Recorded in PROGRESS.md
    // rather than silently fixed or silently ignored.
    if (isNew) {
      const prose = proseOf(body);
      const always = BANNED_ALWAYS.exec(prose);
      if (always) {
        errors.push(
          `${file}: banned word ${JSON.stringify(always[0])} — CONTENT_STYLE §1`,
        );
      }
      const sometimes = BANNED_SOMETIMES.exec(prose);
      if (sometimes) {
        warnings.push(
          `${file}: ${JSON.stringify(sometimes[0])} is on the §1 ban list — keep it only if it is doing real work (a genuine comparison, or "just" meaning "exactly")`,
        );
      }
      const inSummary = BANNED_ALWAYS.exec(
        `${data.summary ?? ''} ${data.explainPrompt ?? ''}`,
      );
      if (inSummary) {
        errors.push(
          `${file}: banned word ${JSON.stringify(inSummary[0])} in frontmatter — CONTENT_STYLE §1`,
        );
      }
    }

    // 5c. estimatedMinutes is computed, not guessed (CONTENT_STYLE §3)
    //
    // A BAND, not an equality: the formula is reading time plus exercise time,
    // and exercise time is a judgement — 2 minutes for a lesson with practice
    // questions, up to 5 for one that has the reader build something. Demanding
    // an exact number would either forbid that judgement or force a second
    // frontmatter field to declare it. The band still catches what matters: a
    // guessed number, and a lesson whose length changed after the number was
    // written. Warned rather than failed for the same reason.
    if (isNew) {
      const declared = Number(data.estimatedMinutes);
      const reading = Math.round(wordCount(body) / 200);
      if (Number.isFinite(declared)) {
        if (declared < reading + 2 || declared > reading + 5) {
          warnings.push(
            `${file}: estimatedMinutes ${declared} is outside ${reading + 2}–${reading + 5} — CONTENT_STYLE §3 is round(words/200) + 2..5 exercise minutes`,
          );
        }
      }
    }

    // 5a. no viz-coupled component in a prose course
    if (isNew) {
      for (const component of VIZ_COUPLED) {
        const at = body.search(new RegExp(`<${component}[\\s/>]`));
        if (at !== -1) {
          const line = body.slice(0, at).split('\n').length;
          errors.push(
            `${file}:${line}: <${component}> is bound to the algorithm-trace pipeline and cannot appear in a ${data.course} lesson`,
          );
        }
      }
    }

    // 5b. PracticeCheck bookkeeping
    //
    // `index` is the stored self-grade's position and `total` is the denominator
    // the Practiced bar divides by, so a lesson whose three questions declare
    // `total={4}` builds cleanly, renders correctly, and makes Practiced
    // permanently unreachable. Nothing on screen says so.
    const checks = [...body.matchAll(/<PracticeCheck\b([^>]*)>/g)].map((m) => ({
      index: Number(/index=\{(\d+)\}/.exec(m[1] ?? '')?.[1] ?? NaN),
      total: Number(/total=\{(\d+)\}/.exec(m[1] ?? '')?.[1] ?? NaN),
      slug: /slug=\{frontmatter\.slug\}/.test(m[1] ?? ''),
    }));
    if (checks.length > 0) {
      const indexes = checks.map((c) => c.index).sort((a, b) => a - b);
      const wanted = indexes.map((_, i) => i + 1);
      if (indexes.join(',') !== wanted.join(',')) {
        errors.push(
          `${file}: <PracticeCheck> indexes must be 1..${checks.length} with no gaps — got ${indexes.join(', ')}`,
        );
      }
      for (const check of checks) {
        if (check.total !== checks.length) {
          errors.push(
            `${file}: <PracticeCheck index={${check.index}}> declares total={${check.total}} but the lesson has ${checks.length} question(s)`,
          );
        }
        if (!check.slug) {
          errors.push(
            `${file}: <PracticeCheck index={${check.index}}> must pass slug={frontmatter.slug}`,
          );
        }
      }
    } else if (isNew) {
      errors.push(
        `${file}: no <PracticeCheck> — every Practice answer must be self-gradable`,
      );
    }

    // 6. internal links resolve
    const links = [
      ...body.matchAll(/\]\((\/[^)\s]*)\)/g),
      ...body.matchAll(/href=["'](\/[^"']*)["']/g),
    ].map((m) => m[1] ?? '');
    for (const href of links) {
      const [pathname] = href.split('#');
      if (STATIC_PATHS.includes(pathname)) continue;
      if (/^\/learn\/(dsa|kubernetes|system-design)\/$/.test(pathname))
        continue;
      const lessonSlug = pathname.match(/^\/learn\/([a-z0-9-]+)\/$/)?.[1];
      if (lessonSlug && published.has(lessonSlug)) continue;
      if (href.startsWith('/glossary/#')) {
        errors.push(
          `${file}: glossary anchor "${href}" — lesson prose must not link into the glossary (decision D-12)`,
        );
        continue;
      }
      errors.push(`${file}: internal link "${href}" resolves to nothing`);
    }

    // 7. diagrams exist and carry accessible text
    for (const m of body.matchAll(
      /^import\s+(\w+)\s+from\s+'[^']*components\/diagrams\/([\w-]+)\.astro';$/gm,
    )) {
      const component = `${m[2]}.astro`;
      /** @type {string} */
      let source;
      try {
        source = readFileSync(
          path.join(root, 'src', 'components', 'diagrams', component),
          'utf8',
        );
      } catch {
        errors.push(`${file}: diagram component ${component} does not exist`);
        continue;
      }
      for (const prop of ['title', 'description', 'caption']) {
        if (!new RegExp(`${prop}=`).test(source)) {
          errors.push(
            `diagrams/${component}: no \`${prop}\` — every figure needs an accessible name, description and caption`,
          );
        }
      }
    }

    // 8. code fences
    for (const { lang, code, line } of fences(body)) {
      if (lang === '') {
        errors.push(`${file}:${line}: fenced code block declares no language`);
        continue;
      }
      if (lang !== 'yaml' && lang !== 'yml') continue;
      /** @type {unknown[]} */
      let docs;
      try {
        docs = code
          .split(/^---$/m)
          .map((d) => d.trim())
          .filter(Boolean)
          .map((d) => parseYaml(d));
      } catch (error) {
        errors.push(
          `${file}:${line}: YAML does not parse — ${(error instanceof Error ? error.message : String(error)).split('\n')[0]}`,
        );
        continue;
      }
      for (const doc of docs) {
        if (typeof doc !== 'object' || doc === null) continue;
        const record = /** @type {Record<string, unknown>} */ (doc);
        const apiVersion = record['apiVersion'];
        const kind = record['kind'];
        if (typeof apiVersion !== 'string' || typeof kind !== 'string')
          continue;
        if (API_DENYLIST.includes(apiVersion)) {
          errors.push(
            `${file}:${line}: apiVersion "${apiVersion}" is removed or deprecated (DECISIONS D-02)`,
          );
          continue;
        }
        const kinds = API_ALLOWLIST[apiVersion];
        if (!kinds) {
          errors.push(
            `${file}:${line}: apiVersion "${apiVersion}" is not on the allowlist (DECISIONS D-02)`,
          );
        } else if (!kinds.includes(kind)) {
          errors.push(
            `${file}:${line}: kind "${kind}" is not served by "${apiVersion}"`,
          );
        }
      }
    }
  }

  // --- 9. coverage -------------------------------------------------------
  const coverage = JSON.parse(
    readFileSync(path.join(root, 'docs', 'courses', 'coverage.json'), 'utf8'),
  );
  const curriculum = readFileSync(
    path.join(root, 'docs', 'courses', 'CURRICULUM.md'),
    'utf8',
  );
  for (const entry of coverage.topics) {
    if (!Array.isArray(entry.lessons) || entry.lessons.length === 0) {
      errors.push(`coverage.json: topic ${entry.id} maps to no lesson`);
      continue;
    }
    for (const slug of entry.lessons) {
      if (published.has(slug)) continue;
      // A slug that is not published and not planned is a typo, and it is an
      // error at every strictness: nothing will ever make it resolve.
      if (!curriculum.includes(`\`${slug}\``)) {
        errors.push(
          `coverage.json: topic ${entry.id} names "${slug}", which is neither a published lesson nor planned in CURRICULUM.md`,
        );
        continue;
      }
      const note = `coverage.json: topic ${entry.id} awaits "${slug}"`;
      pending.push(note);
      if (strict) errors.push(`${note} — not yet written`);
    }
  }
  if (!strict && pending.length > 0) {
    warnings.push(
      `${pending.length} coverage topic(s) await a lesson that CURRICULUM.md plans but nobody has written yet — run with --strict to list them`,
    );
  }

  return { errors, warnings, pending, checked: lessons.length };
}

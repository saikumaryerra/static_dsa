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

/** Placeholder strings, matched case-insensitively (Appendix D item 3). */
const PLACEHOLDERS = [
  'TODO',
  'TBD',
  'FIXME',
  'lorem',
  'coming soon',
  'placeholder',
  'to be written',
  'insert here',
  'xxx',
  '[...]',
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
 * Counts words the way `src/lib/reading-time.ts` does — prose only.
 *
 * A token with no letter or digit in it is not a word: a markdown table's cell
 * separators are five `|` per row, which on a thirteen-row table is eighty
 * "words" of punctuation. Counting them made the ceiling a tax on tables.
 *
 * @param {string} body - The MDX body.
 * @returns {number} Word count.
 */
function wordCount(body) {
  return proseOf(body)
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
    for (const needle of PLACEHOLDERS) {
      const at = body.toLowerCase().indexOf(needle.toLowerCase());
      if (at !== -1) {
        const line = body.slice(0, at).split('\n').length;
        errors.push(`${file}:${line}: placeholder string "${needle}"`);
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

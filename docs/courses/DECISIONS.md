# Course expansion — decisions log

Format: **context → decision → why**. Reversible choices preferred (SPEC §2, §7).
Newest entries appended at the bottom.

---

## D-01 · Kubernetes target version: **1.36**

**Context.** SPEC §5 requires pinning a target Kubernetes minor version, "the current
stable minor per kubernetes.io/releases if web access is available".

**Decision.** Write for **Kubernetes 1.36**. State the version once in the course
description and in the Foundations module, and keep the rest of the content correct
across the whole supported window (1.34 – 1.36) so it does not rot on the next release.

**Why.** Verified by execution in this session (2026-08-26) by fetching
`kubernetes.io/releases`: 1.36 is the latest released minor (latest patch 1.36.2,
2026-06-09); the three maintained minors are **1.36** (EOL 2027-06-28), **1.35**
(EOL 2027-02-28) and **1.34** (EOL 2026-10-27). 1.36 shipped 2026-04-22 ("Haru").

---

## D-02 · API allowlist confirmed against the upstream deprecation guide

**Context.** SPEC §5 lists the API groups lessons may use. Content must not teach a
removed or deprecated API.

**Decision.** The validator's allowlist is the set below, and lessons use nothing else
without an explicit "this is an ecosystem CRD, not core Kubernetes" note.

| Kind(s) | apiVersion |
|---|---|
| Pod, Service, ConfigMap, Secret, PersistentVolume, PersistentVolumeClaim, ServiceAccount, Namespace, Node, Endpoints, LimitRange, ResourceQuota, Event | `v1` |
| Deployment, StatefulSet, DaemonSet, ReplicaSet, ControllerRevision | `apps/v1` |
| Job, CronJob | `batch/v1` |
| Ingress, IngressClass, NetworkPolicy | `networking.k8s.io/v1` |
| HorizontalPodAutoscaler | `autoscaling/v2` |
| PodDisruptionBudget | `policy/v1` |
| Role, RoleBinding, ClusterRole, ClusterRoleBinding | `rbac.authorization.k8s.io/v1` |
| StorageClass, VolumeAttachment, CSIDriver, CSINode, CSIStorageCapacity | `storage.k8s.io/v1` |
| PriorityClass | `scheduling.k8s.io/v1` |
| ValidatingWebhookConfiguration, MutatingWebhookConfiguration, ValidatingAdmissionPolicy, ValidatingAdmissionPolicyBinding | `admissionregistration.k8s.io/v1` |
| EndpointSlice | `discovery.k8s.io/v1` |
| GatewayClass, Gateway, HTTPRoute, GRPCRoute | `gateway.networking.k8s.io/v1` (ecosystem CRD — always labelled as such) |
| CustomResourceDefinition | `apiextensions.k8s.io/v1` |
| APIService | `apiregistration.k8s.io/v1` |
| VolumeSnapshot, VolumeSnapshotClass, VolumeSnapshotContent | `snapshot.storage.k8s.io/v1` (ecosystem CRD — always labelled as such) |

**Deny list** (fails the validator): `extensions/v1beta1`, `apps/v1beta1`, `apps/v1beta2`,
`batch/v1beta1`, `networking.k8s.io/v1beta1`, `autoscaling/v2beta1`, `autoscaling/v2beta2`,
`policy/v1beta1`, `rbac.authorization.k8s.io/v1beta1`, `storage.k8s.io/v1beta1`,
`admissionregistration.k8s.io/v1beta1`, `flowcontrol.apiserver.k8s.io/v1beta1|v1beta2|v1beta3`,
`scheduling.k8s.io/v1beta1`, `apiextensions.k8s.io/v1beta1`, and **any** `PodSecurityPolicy`.

**Why.** Verified by execution: fetched `kubernetes.io/docs/reference/using-api/deprecation-guide/`
this session. Every stable version above is confirmed current; the beta versions above are
confirmed removed. PodSecurityPolicy was removed in 1.25 — Pod Security Admission replaces it.

---

## D-03 · Version-sensitive facts verified this session

Lessons may state these; anything else version-specific must be re-verified before it is written.

- **Native sidecar containers** (`initContainers` entry with `restartPolicy: Always`) are
  **stable since 1.33**; `Always` is the only valid value for an init container's `restartPolicy`.
- **1.36 graduated to GA**: User Namespaces, MutatingAdmissionPolicy, Declarative Validation,
  PSI metrics, Volume Group Snapshots, fine-grained kubelet API authorization, SELinux volume
  label changes.
- **1.36 removed/deprecated**: Service `externalIPs` (deprecated and removed);
  kube-proxy **IPVS** mode removed.
- **Ingress-NGINX** is being retired by the project; Gateway API is the recommended long-term
  replacement for Ingress. Lessons say this rather than recommending Ingress-NGINX for new work.
- **dockershim** was removed in 1.24; no lesson mentions Docker as a runtime except to say
  the kubelet talks to a CRI runtime (containerd, CRI-O).

**Why.** SPEC §5 forbids presenting unverified specifics as fact. These came from
`kubernetes.io` and the release-note coverage of 1.36 fetched on 2026-08-26.

---

## D-04 · Hierarchy: **course → module → lesson**, built by adding `course` above the existing `track`

**Context.** The site models `track → lesson` with a **global** `order` 1–15. SPEC §6 wants
courses with module and lesson navigation. Kubernetes alone needs ~14 modules.

**Decision.**

- Add `course` to the lesson schema: `z.enum(['dsa','kubernetes','system-design']).default('dsa')`.
  The 15 existing lessons are **not edited** — they take the default.
- **`track` keeps its name and its job: it is the module.** For the `dsa` course the two modules
  are the existing `foundations` and `algorithms`. New courses declare new module ids
  (`k8s-foundations`, `sd-foundations`, …). The enum is widened to the full set of module ids,
  which stays type-safe because the ids are a `const` array in `src/lib/tracks.ts`.
- `order` becomes **per-course** (1…N inside a course). DSA keeps 1–15 unchanged, so nothing about
  the existing course moves.
- A new `src/lib/courses.ts` holds `COURSE_ORDER`, `COURSE_COPY` (title, blurb, description,
  difficulty, prerequisites, outcomes) and each course's ordered module id list. `tracks.ts` gains
  `courseId` and `moduleOrder` on each `TrackCopy` entry so a module knows its course.

**Why.** It is the smallest change that produces three levels: one new field, one widened enum,
no renames, no edits to existing content, and every already-generic surface (`TrackArc`,
`renderTracks`, `LessonRef.track`, `MarkComplete`'s milestone) keeps working untouched. Modelling
modules as a *fourth* level under `track` would have given course → track → module → lesson, which
is one level more than the material needs.

**Consequence — prev/next.** With per-course `order`, prev/next chains **within a course**,
naming the module when it changes (exactly today's cross-track behaviour). The end of a course is a
real end, not a dead end at a track boundary, so the M7.1 IA-5 reasoning is preserved. `LessonRef`
gains `course` so the global resume (`nextIncomplete`) sorts by (course, order) and two lessons
sharing `order: 1` do not collide.

---

## D-05 · `/learn/` becomes the catalogue; each course gets its own page

**Context.** `/learn/` today lists every lesson card grouped by track. With three courses that is
~110 cards on one page. SPEC §1 also says the result must not read as "an algorithms site with two
extra cards".

**Decision.**

| URL | Contents |
|---|---|
| `/learn/` | Catalogue. Head + resume CTA + review strip + reset control (all global, unchanged), then **three course cards** with description, difficulty, duration, module/lesson counts and a progress ring. |
| `/learn/dsa/` | The existing Foundations + Algorithms sections, `TrackArc`s and `LessonCard`s — moved verbatim from `/learn/`. |
| `/learn/kubernetes/` | Its modules, same shape. |
| `/learn/system-design/` | Its modules, same shape. |
| `/learn/{slug}/` | Lesson pages — **URLs unchanged**. |

Course pages are three thin files under `src/pages/learn/` delegating to one shared
`CourseIndex.astro`, because Astro cannot host a second dynamic segment beside `[slug].astro`.
A build-time guard fails if any lesson slug collides with a course slug.

**Why.** Lesson URLs are the ones with external links, canonicals, sitemap entries and
localStorage keys behind them, so they must not move — which rules out nesting lessons under their
course. Everything else follows: `/learn/` is the catalogue a multi-course product needs, and the
per-course page is the "course detail page" SPEC §6 asks for. The progress island on `/learn` is
already track-generic, so it moves rather than being rewritten.

---

## D-06 · Difficulty stays `beginner | intermediate`

**Context.** Production Kubernetes and the system-design case studies are advanced material, and
the schema has no `advanced` value.

**Decision.** Do not add one. Use `intermediate` for everything beyond the introductory modules.

**Why.** SPEC §5 says "Difficulty labels come from the existing set". Adding a third value would
also have to be threaded through `LessonLayout`'s prop type, `DifficultyChip`, `LessonCard`, the
D-1 "badge the exception" rule and `difficultySpread()` in `src/pages/index.astro:76-86`, which
silently drops any value outside the hardcoded two. Reversible later; not worth the blast radius
now. Depth is carried by module order and by each course's stated prerequisites instead.

---

## D-07 · `complexity` becomes optional

**Context.** The schema requires four Big-O strings on every lesson. There is no honest Big-O for
"ConfigMaps and Secrets" or "CAP and PACELC".

**Decision.** `complexity: z.object({...}).optional()`. `<ComplexityTable>` and the `## Complexity`
section appear only on lessons that declare it — i.e. only the existing DSA lessons and any future
algorithmic one. Inventing `O(1)` placeholders is explicitly rejected.

**Why.** The alternative — a second collection for non-algorithm lessons — would fork the loader,
the route, the layout, progress, prev/next and every test, to avoid one optional field.

---

## D-08 · Diagrams: hand-written inline SVG in `.astro` components, no new dependency

**Context.** SPEC Phase 4 prefers, in order: a Mermaid renderer the stack already supports; hand-written
SVG components using the design tokens; static SVG assets. The repo has **no** diagram mechanism.

**Decision.** Build `src/components/Figure.astro` (frame, caption, `<title>`/`<desc>`,
`aria-labelledby`) and one `.astro` component per diagram in `src/components/diagrams/`, each
emitting inline SVG that colours itself from the design tokens and scales via `viewBox` +
`max-width: 100%`.

**Why.** Mermaid is not supported "cheaply": client-side rendering would add a large dependency and
eat the ≤ 60 KB gzipped per-page JS budget, and build-time rendering (`rehype-mermaid`) pulls a
headless browser into the build. Static SVG assets cannot follow the light/dark token palette.
Inline SVG in a component is the only option that is zero-dependency, zero-JS, themable and
printable — and it matches the house style already used for the icon set.

---

## D-09 · Two zero-dependency rehype passes for tables and fenced code

**Context.** Markdown tables render with no padding, no borders and no overflow handling, and bare
fenced code blocks have no padding, border, radius or `overflow-x`. Both are load-bearing for
Kubernetes (YAML) and System Design (comparison tables).

**Decision.** Add a small local rehype plugin (written inline in `astro.config.mjs`, no package)
that (a) wraps every markdown `<table>` in `<div class="table-scroll" tabindex="0">` and
(b) adds `class="md-code"` plus `tabindex="0"` to every markdown `pre.astro-code`. Style both in
`LessonLayout` and add them to the measure-breakout and print rules.

**Why.** The CSS-only alternative — `display: block; overflow-x: auto` on the table itself — strips
the table's semantics from the accessibility tree in Chrome and Firefox. The wrapper keeps
`<table>` semantics and makes the scroll region keyboard-reachable (WCAG 2.1.1), which is also what
axe's `scrollable-region-focusable` rule requires. `class="md-code"` is what keeps the new `pre`
styling from fighting `<CodeTabs>`' own rule: component output never passes through rehype.

---

## D-10 · New-lesson section structure

**Context.** SPEC §5 mandates objectives / concept + mental model / concrete example / key
takeaways, with five optional sections. The site enforces its own six-h2 shape on the DSA lessons
and **fails the build** on any published lesson without a literal `## Practice`.

**Decision.** Every Kubernetes and System Design lesson carries these h2s, in this order:

1. `## What you'll learn` — 2–4 concrete objectives (required)
2. `## Intuition` — the concept and its explicit mental model (required)
3. `## How it works` — the mechanism, with at least one manifest, command, worked estimate or diagram (required)
4. `## Trade-offs` — optional
5. `## Common pitfalls` — optional
6. `## Interview notes` — optional
7. `## Key takeaways` — required
8. `## Practice` — required (also the site's build guard)

**Why.** It satisfies SPEC §5 exactly while reusing three heading names the site already uses
(`Intuition`, `How it works`, `Common pitfalls`), so the on-this-page bar and the reader's
expectations carry across courses. `## Complexity` and `## Code` are DSA-only and are simply absent.

---

## D-11 · Lesson files stay **flat** in `src/content/lessons/`, with prefixed slugs

**Context.** 112 new lessons could nest under `lessons/kubernetes/…`; the content
loader's `**/*.mdx` glob handles either.

**Decision.** Flat, with `k8s-` and `sd-` slug prefixes. Filename = slug.

**Why.** Three existing readers walk the lessons directory with a
**non-recursive** `readdirSync` — `tests/unit/glossary-anchors.test.ts`,
`tests/unit/challenges.test.ts` and `tests/e2e/m8-explain-note.spec.ts`. Nested
files would have gone silently uncovered by all three: glossary-link resolution,
challenge-id integrity and the "every authored prompt reaches its own lesson"
check would have quietly stopped applying to the new courses. Flat keeps them
covering everything, and the prefixes give the same grouping in an `ls`.

---

## D-12 · The glossary is one-directional

**Context.** `tests/unit/glossary-anchors.test.ts` fails on a lesson link to a
`/glossary/#term` that has no entry, and the glossary's own build guard fails on
a term naming an unpublished lesson.

**Decision.** New-course lesson prose **does not link into the glossary** — the
validator rejects it. Glossary terms for the new courses may be added later
pointing *at* lessons; that direction is safe and is Phase 5 polish, not a gate
item.

**Why.** It decouples the two: 112 lessons can be written without touching a
curated 48-entry list, and no lesson blocks on a term that does not exist yet.

---

## D-13 · `yaml` added as a devDependency

**Context.** Appendix D item 8 requires the validator to parse the YAML inside
lesson code fences. Spec §4 permits no dependency without a `// SPEC-GAP:`.

**Decision.** `yaml@^2.9.0` in `devDependencies`, used only by
`scripts/lib/content-validator.mjs` and its test. The justification is recorded
at the top of that file.

**Why.** The alternatives were worse. A hand-rolled YAML subset parser is only
worth writing if it is correct, and to be correct it would need block scalars,
anchors and flow collections. Importing the copy npm happens to hoist into
`node_modules` (both `js-yaml` and `yaml` are there transitively) works today and
is nobody's contract. This ships **zero bytes to the browser** — nothing in
`src/` imports it — so the §4 JS budget is untouched.

---

## D-14 · The content validator has a `--strict` mode, and CI runs it

**Context.** `coverage.json` is the plan: it maps all 179 Appendix topics to the
112 lessons, most of which do not exist yet. If a pending topic were an error,
`npm run test` would fail at every intermediate commit — which SPEC §4 forbids
("do not leave the tree broken at a commit boundary"). If it were only ever a
warning, "every Appendix topic is taught" would be a claim nothing checks.

**Decision.** A topic naming a lesson that is *planned in CURRICULUM.md but not
yet written* is a **warning** by default and an **error** under `--strict`. A
topic naming a slug that is in neither is an error at any strictness — it is a
typo. `npm run validate:content -- --strict` is a new CI step.

**Why.** The authoring loop stays green commit by commit, and the completeness
claim is enforced in the one place that cannot be forgotten. It also makes the
§8 gate item mechanical: the gate passes when strict passes.

---

## D-15 · Two exemplar lessons, and what they fix

**Context.** SPEC §3 Phase 2 promotes the Phase 1 lessons to gold standards.

**Decision.** `k8s-what-kubernetes-is` and `sd-design-workflow` are the
exemplars, referenced from CONTENT_STYLE.md. Building them surfaced four
mechanism defects that were fixed before any other lesson was written: markdown
tables had no styling and no scroll container, fenced code blocks had no styling
at all, the site had no diagram mechanism, and a `Figure` scaled to a wide column
rendered its labels larger than the lesson's own headings.

**Why.** That is what a vertical slice is for. Finding them on lesson 3 of 112
would have been cheap; finding them on lesson 90 would not.

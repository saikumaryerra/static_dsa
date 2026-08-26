# Content style — Kubernetes and System Design

Everything a lesson author needs. If this file and a habit disagree, this file
wins. The two exemplars are the tie-breaker for anything it does not say:

- **Kubernetes:** `src/content/lessons/k8s-what-kubernetes-is.mdx`
- **System Design:** `src/content/lessons/sd-design-workflow.mdx`

Read the exemplar for your course before writing. Match its rhythm, not just its
rules.

---

## 1. Voice

Write like a good colleague explaining something at a whiteboard: direct,
concrete, unhurried, and willing to say what a thing costs.

- **Second person, present tense.** "You write down the state you want", not
  "the user will declare the desired state".
- **Short paragraphs.** Three or four sentences. One idea each.
- **Define a term the first time you use it**, in the sentence that uses it.
- **Concrete before abstract.** Show the manifest, then say what it means.
- **Say the trade-off.** Every recommendation names what it costs. A lesson that
  only lists capabilities is a brochure.
- **No hype, no filler.** The validator enforces this, in two tiers.
  **Rejected outright** — "simply", "seamless", "leverage", "utilize", "robust",
  "powerful", "cutting-edge", "effortless": there is no sentence these improve,
  and they are rejected in frontmatter too. **Warned** — "just", "easy",
  "easier", "easily": keep one only when it is doing real work, such as a genuine
  comparison ("cheaper to packet-capture than an overlay") or "just" meaning
  "exactly". As a claim about difficulty, "easy" is the reader's call to make,
  not yours. Also avoid "in today's fast-paced world" and its relatives.
- **No second-person scolding.** "A common mistake is…" not "You probably think…".
- **British or American spelling** — match the existing site, which is British
  ("behaviour" appears in prose, "color" only in code and CSS). Consistency
  inside a lesson matters more than the choice.

Prose length: **600–1,500 words of TEACHING prose**. Code blocks, diagram markup
and `<PracticeCheck>` answers do not count — the answers ship collapsed and are
budgeted as exercise time in §3, not as reading. In practice that puts a healthy
lesson around 1,100–1,400 words, with another 250–350 in its answers.

Below the floor is an **error**. Above the ceiling is a **warning**, because a
lesson carrying a genuinely large reference table can be over it and still be
tight; project and troubleshooting lessons may run longer by design. **Do not
write to the number.** A thin lesson is worse than no lesson, and so is a padded
one — if you find yourself adding a clause to reach 600 or cutting one to reach
1,500, the count is not the problem.

---

## 2. Lesson structure

Every Kubernetes and System Design lesson carries these `##` headings, in this
order. Three are optional — include one **only** when it carries content the
explanation does not already have.

| Heading | Required? | What goes in it |
|---|---|---|
| `## What you'll learn` | **yes** | 2–4 bullets, each a concrete capability. Start each with a verb. |
| `## Intuition` | **yes** | The concept and an explicit mental model — an analogy, a reframing, or "X is really just Y". Name the model in bold. |
| `## How it works` | **yes** | The mechanism, with **at least one** concrete artifact: a manifest, a command, a worked estimate, or a diagram. |
| `## Trade-offs` | optional | What the thing costs, when to use it, when not to. |
| `## Common pitfalls` | optional | Bulleted. Each names the mistake **and** why it is tempting. |
| `## Interview notes` | optional | Only where there is something real to say about applying it. |
| `## Key takeaways` | **yes** | 3–5 bullets. Each states a fact, not a topic. |
| `## Practice` | **yes** | 2–3 questions. **The literal heading `## Practice` — the build fails without it.** |

`## Complexity` and `## Code` are DSA-only; they do not appear in these courses.

**A section that would only restate the explanation is omitted.** Four required
sections done well beat eight sections padded to look complete.

### The Practice section, exactly

The build and the test suite both have opinions here.

```mdx
## Practice

Work each one out before opening the answer.

**1. The question, bolded, on one line?**

<PracticeCheck slug={frontmatter.slug} index={1} total={3}>
  The answer. Two to six sentences. Explain *why*, do not just state the fact.
</PracticeCheck>

**2. …**
```

- `index` is 1-based; `total` is the number of questions **in this lesson**, and
  every `PracticeCheck` in the lesson must carry the same `total`.
- **Never a bare `<details>` or `<Collapsible>` inside `## Practice`.**
  `tests/e2e/m8-practice-check.spec.ts` fails on one: every Practice answer must
  be self-gradable.
- The heading must be exactly `## Practice` — not "Practice questions", not
  "Practice / check yourself".

---

## 3. Frontmatter

```yaml
---
title: 'Pods and the Pod Lifecycle'
slug: 'k8s-pods'
course: 'kubernetes'
track: 'k8s-workloads'
order: 6
summary: 'One sentence a stranger could read in a search result and know whether this is the lesson they want.'
difficulty: 'beginner'
prerequisites: ['k8s-what-kubernetes-is']
estimatedMinutes: 9
tags: ['kubernetes', 'pods', 'workloads']
explainPrompt: 'Why does Kubernetes schedule Pods rather than containers?'
published: true
---
```

- **Single-quoted YAML scalars.** A unit test parses `slug:` with a
  single-quote regex, and `explainPrompt` must never be a block scalar
  (`>` or `|`) — an e2e test throws on one.
- `slug` = the filename, kebab-case, prefixed `k8s-` or `sd-`.
- `course` and `track` come from CURRICULUM.md. `order` is **per course**, and
  CURRICULUM.md assigns it — do not invent one.
- `difficulty` is `beginner` or `intermediate`. **There is no `advanced`**
  (decision D-06).
- `prerequisites` must name **published** slugs; an unknown one fails the build.
  Keep it to the one or two lessons genuinely needed, not everything earlier.
- `complexity` is **omitted** — it is for algorithmic lessons only.
- `explainPrompt` is optional and should ask a real "why", with a real "because"
  in its answer. Skip it rather than author a rhetorical one.
- `published: true` — an omitted flag builds no page.

### `estimatedMinutes` is computed, never guessed

```
estimatedMinutes = round(teaching_words / 200) + exercise_minutes
```

`teaching_words` is what the validator counts: prose without code blocks, diagram
markup or `<PracticeCheck>` answers (the site's own `readingTimeMinutes` uses the
same 200 wpm and strips fences the same way). `exercise_minutes` is **2** for a
lesson with Practice questions only, up to **5** for one that has the reader
build or run something.

The validator warns when your number falls outside `round(words/200) + 2…5`. It
is a band rather than an equality because the exercise term is a judgement — but
a number outside it is either a guess or a leftover from before the lesson
changed length.

---

## 4. MDX mechanics

Imports go immediately after the frontmatter fence, path-relative — there is no
`@` alias:

```mdx
import Callout from '../../components/Callout.astro';
import PracticeCheck from '../../components/PracticeCheck.astro';
import Figure from '../../components/Figure.astro';
import K8sArchitecture from '../../components/diagrams/K8sArchitecture.astro';
```

Available to these courses:

| Component | Use |
|---|---|
| `PracticeCheck` | Every Practice answer. Required. |
| `Callout` | `variant="note" \| "tip" \| "warning"`. One or two per lesson at most. |
| `Collapsible` | `summary`, `open?`. Long reference material **outside** Practice. |
| `Figure` / a diagram component | See §6. |
| `Bench` | Prose beside a pinned artifact at ≥1200px. Use for a lesson built around one diagram. |
| `Band` | Two peer cards side by side. Rarely needed here. |

**Do not use** `Visualizer`, `Challenge`, `FinalRun`, `StepLink` or
`ComplexityTable` — all four are bound to the algorithm trace pipeline and will
fail the build outside it.

**Every heading must have rendered content with JavaScript off.** An e2e test
walks each lesson's outline and fails on a heading whose section is empty or
JS-only.

**Internal links** are root-absolute with a trailing slash:
`[Pods](/learn/k8s-pods/)`. They must resolve to a published lesson.
**Do not link to `/glossary/#…`** — a unit test fails on a glossary anchor with
no matching term, and the glossary is curated separately (decision D-12).

---

## 5. Code blocks

- **Every fence declares a language.** `yaml`, `bash`, `json`, `text`, `sql`,
  `go`, `python`, `javascript`, `hcl`, `dockerfile` all highlight. An unknown
  language fails the build.
- **YAML must parse**, and every Kubernetes manifest must be complete enough to
  `kubectl apply`: `apiVersion`, `kind`, `metadata.name`, and a `spec` that is
  actually valid. No `...` elisions inside a manifest — cut the example down
  instead.
- **`apiVersion`/`kind` pairs come from the DECISIONS D-02 allowlist.** Anything
  on the deny list fails the validator. Never `PodSecurityPolicy`.
- The allowlist also carries a short **ecosystem** section — `kind`'s cluster
  config, `kustomization.yaml`, Argo CD, KEDA, Kyverno and the Prometheus
  operator's CRDs — because the curriculum teaches those and a lesson that
  cannot show its own subject's YAML is teaching around it. Showing one does not
  excuse you from saying, in the prose, that it is not core Kubernetes.
- **Commands use real flags** and real output shapes. If you show output, it must
  be what the command actually prints.
- **Units:** `Mi`/`Gi` for memory, `m` for millicores, `1Gi` not `1G`.
- Keep a fence under ~25 lines. Two focused manifests beat one long one.
- **ASCII only in a fence's own drawing.** The site's webfonts are subset to the
  characters this repo contains, so box-drawing glyphs (`│ └ ├ ─`) are not
  covered and would fall back to a system font — in a block whose entire value is
  that the columns line up. Use `|`, `'` and `-`. The validator rejects any
  character outside the subset.
- Use `bash` for commands, and do **not** prefix them with `$`.

---

## 6. Diagrams

The mechanism is `src/components/Figure.astro` plus one `.astro` component per
diagram in `src/components/diagrams/` (decision D-08). Read
`src/components/diagrams/K8sArchitecture.astro` before writing one.

Rules:

- `Figure` owns the `<svg>`; the diagram supplies only shapes.
- Every diagram declares `title` (short noun phrase), `description` (a full text
  alternative — a reader who cannot see it must lose nothing) and `caption`
  (what to take away; never a restatement of the title).
- **Use only the drawing kit's classes** — `dg-box`, `dg-box--accent`,
  `dg-group`, `dg-line`, `dg-line--soft`, `dg-head`, `dg-head--soft`,
  `dg-label`, `dg-sub`, `dg-mono`, `dg-legend`. **Never a hardcoded colour**;
  both themes and forced-colors mode come from the kit.
- Keep the `viewBox` small (≈600–720 wide). Those units are the font sizes, and
  the frame caps the drawing at 1:1 so a diagram's type matches the prose.
- **No connector may cross a box.** Route through empty space; leave a lane.
- One accent box per figure, at most.
- Arrowheads are `<polygon class="dg-head">`, never an SVG `<marker>`.

---

## 7. Terminology and capitalization

Apply this exactly; the reviewer checks it.

### Kubernetes

| Write | Not |
|---|---|
| Pod, Deployment, Service, ConfigMap, Secret, Node, Namespace, StatefulSet, DaemonSet, Job, CronJob, Ingress, NetworkPolicy, PersistentVolume, PersistentVolumeClaim, StorageClass, ServiceAccount, ResourceQuota, LimitRange, PodDisruptionBudget, HorizontalPodAutoscaler | pod, deployment, service, configmap… |
| `kubectl` (lowercase, code-formatted) | Kubectl, KubeCTL |
| control plane | master, master node |
| worker node, node | minion |
| container runtime, CRI | Docker (as the runtime) |
| kubelet, kube-proxy, kube-apiserver, kube-scheduler, etcd | Kubelet, KubeProxy, API-server, ETCD |
| Kubernetes | K8s in prose (the abbreviation is fine in a slug) |
| Pod Security Admission, Pod Security Standards | PSP, PodSecurityPolicy (removed in 1.25) |

A Kubernetes API kind is capitalized when it names the object type ("create a
Deployment") and lowercase when it is the English word ("a deployment pipeline").

### System Design

- **Netflix-like**, **Spotify-like**, **YouTube-like** for the teaching model —
  never the bare company name for something we are designing.
- Consistent vocabulary: *availability*, *durability*, *p99 latency*,
  *consistency model*, *idempotency*, *backpressure*, *throughput*, *replication*,
  *partitioning*, *sharding*. Do not swap in synonyms lesson to lesson.
- "eventually consistent", not "eventual consistent".
- QPS for queries per second; state it once per lesson before using it.

---

## 8. Accuracy

### Kubernetes

Write for **1.36** (DECISIONS D-01; 1.34, 1.35 and 1.36 are the maintained
minors). Verified facts you may state are in DECISIONS D-03. Anything else
version-specific must be verified before it is written, or phrased without a
version claim.

Say when something is **ecosystem, not core Kubernetes**: Helm, Kustomize,
Argo CD, Flux, Prometheus, KEDA, Kyverno, OPA Gatekeeper, cert-manager,
Gateway API implementations, the CSI snapshot CRDs. One clause is enough — "Helm
is not part of Kubernetes; it is the ecosystem's package manager."

### System Design

Every architectural statement carries one of three labels, in the prose itself:

1. **Publicly documented** — name the source. The ones this course may cite:
   Netflix Open Connect (openconnect.netflix.com), Netflix's public writing on
   microservices and chaos engineering, Spotify's engineering blog, the 2016
   RecSys paper *Deep Neural Networks for YouTube Recommendations* (Covington,
   Adams, Sargin), and YouTube's published resumable-upload API documentation.
   **Named academic and industry literature counts too**, cited the same way —
   author and year, no URL: Dean and Barroso's *The Tail at Scale* (CACM, 2013),
   Abadi's PACELC paper (2012), Terry et al. on session guarantees (1994),
   Brewer's CAP conjecture and the Gilbert–Lynch proof (2002). Add to this list
   when you cite something new, so the next author can reuse it.
2. **Generally accepted industry architecture** — the shape any team would
   arrive at, not a claim about one company.
3. **A teaching assumption** — something we are choosing to keep the example
   concrete.

Never present a private implementation detail as fact. When in doubt, label it
(2) or (3).

**Capacity estimates show their assumptions and their arithmetic**, in a `text`
fence, and the results are orders of magnitude — "roughly 7,000 reads per
second", not "6,847 reads per second".

### Links

**No external URL in lesson prose unless it was fetched and confirmed in the
session that wrote the lesson.** Otherwise reference the source by name. Internal
links must resolve.

---

## 9. What the validator will reject

`npm run validate:content` (and the unit test that wraps it) fails on:

- Missing or malformed frontmatter; a difficulty outside the allowed set.
- A duplicate slug, or an `order` that is not contiguous from 1 within its course.
- Any placeholder string: `TODO`, `TBD`, `FIXME`, `lorem`, `coming soon`,
  `placeholder`, `to be written`, `insert here`, `xxx`, `[...]`.
- A missing required section, or an optional section present but empty.
- Prose below the word floor (warns above the ceiling).
- An unresolved internal link or an unresolved prerequisite.
- A fenced block with no language; YAML that does not parse.
- A manifest whose `apiVersion`/`kind` is off the allowlist, or on the deny list.
- A `coverage.json` topic with no lesson, or a lesson slug that does not exist.

Run it on your own files before you report done.

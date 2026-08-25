# Course Expansion Spec — Kubernetes and System Design tracks

> Save this file as `docs/courses/SPEC.md` and commit it. Section 0 is for the human operator; the agent executes from Section 1 onward.

## 0. Operator notes (agent: skip to §1)

**Why this lives in the repo.** A task this size outlives any single context window. Keeping the spec, the progress file and the decisions log in the repository means the agent re-reads them after compaction or a restart instead of relying on a compacted memory of the original prompt.

**Before you start**

- Update Claude Code to v2.1.234 or later. It now waits for a usage limit to reset and continues on its own (`/config` → "Continue automatically at usage limit"). Desktop shows the same thing as a checkbox on the session-limit card. Weekly limits are not auto-continued the same way, so the checkpoint discipline in §4 still matters.
- Run in auto mode (the default on Pro, Max and Team). Add the repo's test, lint, typecheck and build commands to `permissions.allow` so subagents don't stall on permission prompts mid-run.
- Add to `CLAUDE.md` (create it if missing):

  ```
  Course expansion: before any related work, read docs/courses/SPEC.md and, if present,
  docs/courses/PROGRESS.md, and follow the resume protocol in SPEC.md §4.
  All lessons follow docs/courses/CONTENT_STYLE.md.
  ```

**Parallel execution setup** (the agent uses subagents, workflows and optionally agent teams per §10)

- Copy the three worker definitions in Appendix E into `.claude/agents/` before launching. Definitions written into a directory that did not exist at session start are not picked up until a restart, and pre-creating them lets the agent fan out without waiting.
- Dynamic workflows are available on paid plans; on Pro, turn them on from the Dynamic workflows row in `/config`. Leave the workflow size guideline at its default.
- Agent teams are optional and experimental. To allow them, set `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` in the `env` block of `settings.json`. They need an interactive session, use several times the tokens of a single session, and in-process teammates are not restored by `/resume`, so only enable them if you will be near the terminal. Leave them off for a fully unattended run.
- Parallel authoring multiplies usage. The spec pilots one module before fanning out; check `/usage` after the pilot before letting a larger batch run.

**Kickoff prompt**

```
Read docs/courses/SPEC.md in full, then execute it end to end, starting at Phase 0.
This is an execution task: do not stop to present a plan or ask for approval — write
planning artifacts to docs/courses/ and keep working. Use parallel subagents and
workflows wherever SPEC.md §10 allows. If docs/courses/PROGRESS.md already exists,
this is a resume: follow SPEC.md §4.
```

**Optional goal** (keeps the session working turn after turn until the gate is met)

```
/goal The course expansion in docs/courses/SPEC.md is complete: every item in its §8
verification gate is checked in docs/courses/PROGRESS.md, and the content validator,
test suite, lint, typecheck and production build have all been run in this session
with passing output visible in the transcript.
```

The goal evaluator only sees the transcript, which is why §3 Phase 6 tells the agent to print check results rather than only writing them to files.

**Manual resume prompt** (if you ever need it)

```
Resume the course expansion: follow SPEC.md §4 — read PROGRESS.md and DECISIONS.md,
check git status and log, run the validator and fast checks, then continue from
"Next actions". Do not re-plan or redo completed work.
```

**Defaults applied** (change them in the section named if you disagree): the agent works on a branch and does not push or open a PR (§3 Phase 0); modules are the atomic unit and may be authored in parallel across both tracks once Phase 2 is committed, with Kubernetes first as the single-session fallback (§3 Phase 3); at most four parallel workers until a one-module pilot passes, then up to eight (§10); lesson and course sizing per §5; the `docs/courses/` working files stay in the repo after completion because they document the feature (§9).

---

## 1. Mission

You are the autonomous implementation agent for this repository. Extend the existing learning catalogue, which today contains algorithm content, with two complete, production-quality learning tracks:

1. **Kubernetes**: fundamentals through production operations (Appendix A).
2. **System Design**: reusable principles first, then applied case studies of Netflix-like, Spotify-like and YouTube-like platforms, plus a comparative section (Appendix B).

Deliver the whole feature: content, catalogue integration, tests, validation, polish. The task is complete only when the §8 gate passes. Planning artifacts are encouraged as files; stopping after planning is not allowed.

Afterwards the product should read as a broader engineering learning catalogue, not an algorithms site with two extra cards. Update site-level copy and metadata that presume algorithms-only content (hero, tagline, meta title and description, README, navigation labels) without renaming the product or changing its branding.

## 2. Operating principles

**Autonomy.** Do not ask clarification questions. When something is ambiguous, inspect the product, infer the most consistent intent, decide, and record the decision in `docs/courses/DECISIONS.md` as a short entry (context → decision → why). Prefer reversible choices. Never wait for approval on ordinary implementation decisions.

**Preserve.** Understand before changing. Reuse existing abstractions. Preserve all existing algorithm content and behavior. Do not rewrite or destabilize what works. Touch existing files only where a shared abstraction needs to change, and run the existing checks first to establish a baseline.

**The high road.** Correctness, security, accessibility, UX quality, maintainability, consistency and completeness beat the fastest superficial implementation. Simple and conventional beats clever.

**No fake completeness.** Success is not declared while any of these remain: placeholder or stub content; TODOs affecting the feature; broken routes, dead links or missing navigation; incomplete modules; dummy buttons; inconsistent styling; missing mobile behavior; new console errors; failing tests, type errors or build errors; obvious accessibility problems; content that names topics without teaching them.

**Honest verification.** In progress notes and the final report, distinguish *verified by execution* (a command ran, a page loaded, a test passed) from *reviewed by inspection* (you read it). Never describe the second as the first.

## 3. Execution plan

Work in the order below. Each phase ends with checks green, `PROGRESS.md` updated, and a commit.

### Phase 0 — Reconnaissance and baseline

Inspect the repository before changing anything. Determine: framework and version; package manager; build tooling; frontend and backend architecture; data layer; authentication and authorization; routing; the catalogue and course/module/lesson data model and content storage format; the existing algorithm course structure; component library and design tokens (typography, spacing, color, icons, cards, navigation, tabs, accordions); responsive and accessibility conventions; state management; analytics or event conventions; test setup; lint, type-check and formatting tooling; CI and build scripts; deployment assumptions.

Trace the algorithm catalogue end to end: how a user discovers a course, opens it, navigates modules and lessons, reads content, tracks progress (if supported), and returns to the catalogue. You will extend that architecture, not build a parallel one.

Recon parallelises well: spawn read-only Explore subagents, one per area (data model and content loading; routing and pages; design system and components; tests, tooling and CI), and assemble their summaries (§10).

Run the existing test, lint, typecheck and build commands and record the baseline. Pre-existing failures are not yours to fix unless they block you; note them.

Outputs: `docs/courses/RECON.md` (at most one page of findings later phases depend on), `docs/courses/DECISIONS.md` (started), `docs/courses/PROGRESS.md` (created per §4). Create a working branch, `feat/kubernetes-and-system-design-courses` or the repo's naming convention. Commit locally throughout; do not push and do not open a PR. The operator reviews the branch when you report completion.

### Phase 1 — Vertical slice

Wire both courses into the product with real metadata and one real, complete lesson each (not placeholders) through every layer: data model (migrations and seeds if DB-backed; files following the existing loader if file-backed), catalogue cards, course detail page, module and lesson navigation, deep links, progress/completion/resume behavior where the product supports it, search or filter indexing if it exists, and tests for the new behavior. Run all checks. Commit.

From here on the product is shippable at every commit: two real courses that happen to be short, never two broken ones.

### Phase 2 — Curriculum outline, style guide, exemplar

1. `docs/courses/CURRICULUM.md`: every module and lesson for both tracks with slug, title, a one- or two-line objective, and the Appendix topics it covers. This is the plan that survives compaction; keep it current.
2. `docs/courses/coverage.json` (or the equivalent in the content format): a map of every Appendix A/B topic to the lesson slug(s) that teach it. The validator (§8) checks that every topic is mapped and every mapped lesson exists.
3. `docs/courses/CONTENT_STYLE.md`: voice; lesson structure (§5); formatting rules for the content format; code-block conventions; terminology and capitalization glossary; diagram conventions; how estimated durations are computed.
4. Promote the two Phase 1 lessons to gold-standard exemplars: self-review them against §5, fix, and reference them from CONTENT_STYLE.md. Every later lesson is held to the exemplars.
5. If the operator has not already, create the worker definitions in Appendix E under `.claude/agents/` and commit them. Parallel authoring (§10) starts only after this phase is committed.

### Phase 3 — Content production loop

The module is the atomic unit: at every commit a module is either absent or complete, validated and reviewed. With parallel authoring (§10), a batch may draw modules from both tracks. In the single-session fallback, finish Kubernetes before starting System Design, so an interruption leaves one whole course rather than two halves.

Pilot first: author one module (yourself or with one worker), take it through steps 2–4 below, and only then fan out.

For each module or batch of modules:

1. Write the lessons yourself, or delegate per §10. Every worker receives the delegation package: the exact lessons to write (from CURRICULUM.md); target file paths and the content schema; CONTENT_STYLE.md (path or contents); the exemplar lesson path; the accuracy rules in §5; and the instruction to write only those files, run the validator on them, and return a five-line summary rather than the content.
2. Run the content validator and the fast checks.
3. Review pass for accuracy and style with `content-reviewer` workers, one per module, in parallel; fix findings.
4. Update CURRICULUM.md status, coverage.json and PROGRESS.md. Commit with a message naming the module(s).

Never leave a module half-written across a checkpoint without PROGRESS.md stating exactly which lessons exist and which don't. If a piece of content is too large for one step, split it by lesson and checkpoint after each.

### Phase 4 — Diagrams

Build the diagrams in Appendix C using the product's existing diagram mechanism if it has one; otherwise the simplest maintainable option that fits the stack, in this preference order: a Mermaid renderer the stack already supports cheaply; hand-written SVG components using the design tokens; static SVG assets. Every diagram is responsive (`viewBox`, scales to container width), themed consistently, readable at 375px wide or given a mobile variant, and accompanied by an accessible text description (`<title>`/`<desc>` or adjacent prose). Once the mechanism is chosen and one exemplar diagram is committed, build the rest in parallel, one subagent per diagram (§10). Verify diagrams render in the running app yourself; do not assume.

### Phase 5 — Integration polish

Catalogue UX, discoverability, responsive behavior, accessibility and site copy per §6. Do not invent a UX pattern where the product already has one.

### Phase 6 — Verification gate

Run everything in §8, using `check-runner` workers in parallel so logs stay out of your context (§10). Fix failures rather than reporting them. Print the results of every check in your response, not only into files, so the outcome is visible in the transcript.

### Phase 7 — Final report

Per §9.

## 4. Session resilience: checkpoints and resume

You cannot observe your own usage quota and must never claim to. Do not build, run or simulate a usage monitor. The harness handles usage limits (it waits for the reset and continues); a weekly limit or a closed session can still stop you, so your job is to make any interruption cheap.

**`docs/courses/PROGRESS.md`** is the single source of truth for state. Update it after every completed unit (phase, module, lesson batch, integration step). Structure:

- Status per phase, and per module: lessons written / validated / reviewed / committed.
- In progress: the exact file(s) and what remains.
- Next actions: the next three concrete steps.
- Verification: which checks were last run, at which commit, with what result.
- Known issues, including pre-existing baseline failures.
- The §8 gate checklist, each item unchecked until it is true.

**Commit** after every completed unit with a descriptive message. Do not leave the tree broken at a commit boundary. Treat every completed unit as if the session might end immediately after it.

**Parallel runs are not part of the record.** Workflow and agent-team state does not survive a restart (§10). PROGRESS.md and the commit log must be current before a parallel run starts and again as soon as it ends; a run that is lost is re-dispatched from the files, never reconstructed from memory.

**Resume protocol** (new session, after compaction, after a limit reset, or whenever you are unsure of state):

1. Read SPEC.md, PROGRESS.md, DECISIONS.md and CURRICULUM.md.
2. Run `git status` and `git log --oneline -20`; reconcile against PROGRESS.md.
3. Run the validator and the fast checks.
4. Continue from "Next actions". Do not re-plan from scratch, do not redo completed work, and do not re-inspect the repository beyond what reconciliation requires.

**Failure recovery.** A command fails: read the error, find the root cause, fix, rerun. A dependency fails: check compatibility, prefer an existing dependency, otherwise the most stable compatible alternative. A test fails: reproduce, diagnose, fix, rerun. The build fails: fix every error introduced by this work. Never stop because the task is large.

## 5. Content quality standard

### Lesson structure

Required in every lesson:

- Learning objectives (two to four, concrete).
- Concept explanation with an explicit mental model.
- At least one concrete example: manifest or command, code, worked estimate, or diagram.
- Key takeaways.

Include when they carry real content (most lessons, but never forced):

- Architecture or diagram.
- Trade-offs.
- Common mistakes.
- Practical exercise with expected outcome (interactive if the product supports exercises; otherwise clear steps plus the expected result).
- Interview and application notes.

A section that would only restate the explanation is omitted. Examples build from simple systems to production scale across each course.

### Sizing

- Lesson prose: 600–1,500 words excluding code and diagrams. Projects and troubleshooting scenarios may run longer.
- Modules: three to six lessons. Kubernetes about 50–70 lessons; System Design about 35–50 (Foundations 6–8, Building blocks 10–14, each case study 5–7, comparison 2–3).
- Prefer fewer complete lessons over many thin ones, but every Appendix topic must be covered.

### Accuracy rules — Kubernetes

- Pin a target version in DECISIONS.md: the current stable minor per kubernetes.io/releases if web access is available, otherwise the latest you are confident about, stated as such. Write for that version.
- Use only current API groups and versions: `apps/v1`; `batch/v1` for CronJob; `networking.k8s.io/v1` for Ingress and NetworkPolicy; `gateway.networking.k8s.io` for Gateway API; `autoscaling/v2` for HPA; `policy/v1` for PodDisruptionBudget. Pod Security Admission, not PodSecurityPolicy (removed in 1.25). No dockershim-era guidance.
- Every manifest is valid and complete enough to apply. Validate manifests with `kubeconform` or `kubectl apply --dry-run=client` if available; at minimum, YAML parse plus an `apiVersion`/`kind` allowlist in the validator.
- Every command uses real flags. Units are correct (`Mi`, `Gi`, millicores `m`).
- Say when a topic lives in the ecosystem rather than core Kubernetes (Helm, Kustomize, Argo CD/Flux, Prometheus, KEDA, Kyverno/OPA Gatekeeper).

### Accuracy rules — System Design

- Label architectural statements at one of three levels: publicly documented (name the source: Netflix Open Connect, Netflix's public writing on microservices and chaos engineering, Spotify Engineering posts, the 2016 YouTube deep-learning recommendations paper, YouTube's resumable-upload API documentation); generally accepted industry architecture; teaching assumption. Never present a private implementation detail as fact. Use "Netflix-like", "Spotify-like" and "YouTube-like" when describing the teaching model.
- Capacity estimates show assumptions and arithmetic; numbers are orders of magnitude, not invented specifics.
- Consistent vocabulary across the course: availability, durability, p99 latency, consistency models, idempotency, backpressure.

### Links, references, terminology

- No external URL in lesson content unless fetched and confirmed during this session; otherwise reference by name. Internal cross-links must resolve.
- Kubernetes API kinds capitalized (Pod, Deployment, Service, ConfigMap); `kubectl` lowercase; "control plane", not "master". Keep the glossary in CONTENT_STYLE.md and apply it.
- Difficulty labels come from the existing set. Estimated durations are computed (reading time at about 200 words per minute plus exercise time), never guessed, using the existing courses' method if one exists.
- Course titles match the catalogue's style. Suggestions: "Kubernetes: From Fundamentals to Production"; "System Design: Principles and Real-World Architectures"; case studies titled "Designing a Netflix-like Streaming Platform" and so on.

### Content validation before completion

Inspect final content for factual consistency, duplicate lessons, broken references, contradictory terminology, missing sections, accidental placeholders, malformed markdown or HTML, broken code examples, broken links, awkward copy, and inconsistent capitalization, difficulty labels and metadata. The validator (§8) enforces what can be automated; you review the rest.

## 6. Integration requirements

**Catalogue UX.** Each course has, where the product supports it: title, concise description, category, difficulty, estimated duration, module and lesson counts, learning outcomes, prerequisites, course card, course detail page, module and lesson navigation, progress tracking, completion state, and resume/continue behavior. Suggested prerequisites: Kubernetes — container and Docker basics, Linux shell, YAML; System Design — has built a web backend, basic HTTP and database knowledge.

**Discoverability.** If search, filters, tags, categories, featured content or difficulty filters exist, integrate the new courses and confirm relevant keywords resolve. Do not build a search subsystem that doesn't exist; match the product's level of complexity.

**Data layer.** DB-backed content: migrations and seeds so a fresh environment includes the new courses, with stable IDs and slugs so progress data keys don't break. File-backed content: same loader, same schema; add schema validation if a content type exists.

**Responsive.** Desktop, tablet, mobile. Check cards, navigation, lesson content, tables, diagrams, code blocks, accordions, sidebars and progress indicators. No horizontal overflow unless intentional and handled (scrollable code blocks and tables, for example).

**Accessibility.** Semantic HTML; keyboard navigation with visible focus; correct heading hierarchy; accessible buttons and links; labels on form controls; sufficient contrast; alt text for meaningful images; accessible text for every diagram; no hover-only interactions; screen-reader-friendly navigation. Follow the project's existing patterns.

**Technical quality.** Follow existing conventions for naming, folder structure, component composition, state, data fetching, error handling, styling, types, validation and testing. No new dependencies unless necessary; if you add one, verify compatibility and justify it in DECISIONS.md.

**Testing.** Add tests for: new courses appear in the catalogue; course, module and lesson navigation; lesson content renders; progress behavior if supported; existing algorithm content still works; routes and deep links; graceful handling of invalid or missing content; responsive-critical components. Use the existing test stack; add viewport and axe-style checks if the stack already has browser testing.

## 7. Decision policy

When options conflict, in this order: the user's stated goal; existing product conventions; correctness and security; accessibility; user experience; maintainability and simplicity; performance and scalability.

If two options remain comparable: less long-term debt; no unnecessary abstraction; no premature infrastructure; reversible over irreversible; easiest for the next engineer to understand. Record the choice in DECISIONS.md and move on.

## 8. Verification gate

**Automated. Build these, then keep them green.**

- Content validator (script or test; Appendix D): required metadata; unique slugs and contiguous ordering; no placeholder strings; required lesson sections present and non-empty; word-count bounds; internal links resolve; diagrams exist and have accessible text; fenced code blocks declare a language; YAML parses; Kubernetes manifests use the API allowlist; every Appendix topic in coverage.json maps to an existing lesson.
- Existing and new unit, integration and component tests.
- End-to-end tests if the stack has them, covering key pages at 375, 768 and 1280px with a horizontal-overflow check and console-error capture.
- Typecheck, lint, formatting, production build.
- A one-off external link check before the final report (not in the unit suite).

**Manual. Do these and say how.**

- Load the catalogue, both course pages, every module and a sample of lessons in a real browser if any browser automation is available (the project's e2e tooling, a Playwright MCP server, or Claude Code's Chrome integration); inspect screenshots at the three widths; read the console. If no browser is available, review statically and say so in the report.
- Keyboard-only walk through catalogue → course → module → lesson → back.
- Read every lesson once in its rendered form.

**Checklist. All must be true.** The existing algorithm catalogue works. The Kubernetes course exists, is fully navigable, and every Appendix A topic is taught. The System Design course exists with foundations, building blocks, the three case studies and the comparative section, and every Appendix B topic is taught. Both courses are visible in the catalogue with correct metadata. Navigation and deep links work. Progress and completion work if supported. Responsive layout verified. Accessibility checked. Diagrams render. No placeholders, feature-related TODOs, broken links, or new console or runtime errors. Validator, tests, typecheck, lint and build pass. Final content reviewed for quality and consistency. The PROGRESS.md gate checklist is fully checked.

## 9. Final report

Concise, in these sections:

1. What was built: Kubernetes course (modules, lesson count); System Design course (foundations, building blocks, each case study, comparison); catalogue integration; diagrams.
2. Technical changes: data model, routes, components, shared abstractions touched, dependencies added with justification, migrations and seeds.
3. Validation: exact commands run and their results, separated into verified-by-execution and reviewed-by-inspection; baseline issues that predate this work.
4. Decisions worth knowing: the three to five most consequential entries from DECISIONS.md.
5. Known limitations, if any, stated plainly.

No implementation noise. Write the same report to `docs/courses/REPORT.md`. Leave the other `docs/courses/` working files (RECON, DECISIONS, PROGRESS, CURRICULUM, CONTENT_STYLE, coverage) in place; they document the feature.

## 10. Parallel execution: subagents, workflows and agent teams

Use parallelism wherever the work splits into units with disjoint files, and never where it doesn't. Appendix E defines the worker roles.

**Rules that always apply**

1. You, the main session, are the coordinator. You alone edit the shared files (CURRICULUM.md, coverage.json, PROGRESS.md, DECISIONS.md, the course registry or index, shared components) and you alone run `git commit`. Workers never touch shared files and never run git commands.
2. Every parallel unit owns a disjoint set of files. Lessons are the natural unit and a module the natural batch. Integration code is edited by one agent at a time.
3. Parallel authoring starts only after Phase 2 is committed: the schema, style guide and exemplars are what make independent workers consistent.
4. Workers start with an empty context. They see nothing you have read or decided unless you put it in the delegation package (§3 Phase 3 step 1), so pass the package every time.
5. A run is one bounded batch: at most one module per worker and at most four workers at once until the one-module pilot has passed, then up to eight. After every batch: validate → review → update shared files → commit. Parallel runs multiply usage, a large fan-out can exhaust the weekly allowance, and workflow and team state does not survive a restart, so progress lives in files and commits before a run starts and as soon as it ends, never in the run.
6. Workers return summaries (files written, validator result, at most five lines of notes), never content, so your context stays small.

**Which mechanism for which work**

| Work | Mechanism | Notes |
|---|---|---|
| Phase 0 recon | Read-only Explore subagents in parallel, one per area | Each returns a short summary; you assemble RECON.md |
| Phase 3 authoring | A dynamic workflow when available (ask for it explicitly: "use a workflow to…"): one `lesson-author` agent per lesson in the batch, then a `content-reviewer` stage per module, returning findings. Otherwise background `lesson-author` subagents, one per module | A fan-out of many small agents preserves more progress on interruption than one long agent |
| Phase 3 review | `content-reviewer` subagents in parallel, one per module. For case studies add a second reviewer briefed only to challenge the three-level labels (documented / accepted / assumption) | Findings return as `path:line` lists; you fix or delegate the fixes |
| Phase 4 diagrams | One subagent per diagram once the mechanism and an exemplar diagram are committed | Disjoint files; you verify rendering |
| Phase 6 checks | `check-runner` subagents run the validator, tests, lint, typecheck and build in parallel, returning only failures. For a stubborn failure, a "keep fixing until the check passes" workflow | Keeps logs out of your context |
| Both tracks at once | Optional agent team, only if the operator enabled it: one teammate per track authoring modules while you integrate and review | Caveats below |

**Subagent facts to work with.** Subagents run in the background by default and their results arrive as completion notifications; wait for them rather than reporting early. Project definitions in `.claude/agents/` load CLAUDE.md and the git status snapshot but not your conversation. If `.claude/agents/` did not exist when the session started, definitions you write now are not picked up until a restart: fall back to `general-purpose` subagents carrying the same prompt text as the Appendix E definition. Use `isolation: worktree` only for work that edits shared code; lesson files don't need it. Give the same worker a follow-up by resuming it rather than spawning a new one when its prior context matters.

**Workflow facts.** A workflow orchestrates many subagents from a script the harness runs in the background; up to 16 agents run concurrently and a run is resumable only within the same session. Its agents run in acceptEdits mode and inherit the permission allowlist, so shell commands outside the allowlist can prompt mid-run. Run a one-module pilot first, keep each run to one batch, and have agents write results to files as they finish.

**Agent-team caveats.** Teams are experimental and off by default; teammates are full sessions with far higher token cost; in-process teammates are not restored by `/resume`, so after any restart spawn fresh ones from PROGRESS.md; the shared task list needs the Task tools, which newer models lack unless the operator enabled them, so coordinate through messages otherwise; teammates may stop on errors and the lead may declare completion early, so check their output and keep going. While teams are enabled, a subagent you spawn with a `name` launches as a teammate and its result will not come back to you as a subagent result, so do not name ordinary subagents. Each teammate owns a disjoint file set, exactly as for subagents, and only you commit.

## 11. The most important instruction

Execute; do not propose. Inspect, then implement immediately. Decide autonomously and record decisions. Work continuously; parallelise per §10 wherever files are disjoint; checkpoint and commit at every unit; fix your own errors; validate your own work; when unsure of state, follow the resume protocol. Stop only when the §8 gate is satisfied, or when a system constraint outside your control stops you, in which case PROGRESS.md must already describe exactly how to continue.

---

## Appendix A — Kubernetes curriculum

Every topic below is mandatory. The module partition is a strong suggestion: merge, split or reorder if the existing course structure warrants it, and keep coverage.json accurate. Progress from fundamentals to production. For each workload type and feature, explain when to use it and when not to.

1. **Foundations** — what Kubernetes is; why orchestration exists; containers vs orchestration; architecture; control plane vs worker nodes; the API and API server; declarative configuration; desired vs current state and reconciliation; clusters, nodes, namespaces; kubectl essentials and manifest anatomy; a local cluster for the exercises (kind, minikube or k3d).
2. **Core workloads** — Pods; ReplicaSets; Deployments; StatefulSets; DaemonSets; Jobs; CronJobs; labels and selectors; annotations; Pod lifecycle and phases; init containers and sidecars.
3. **Networking** — the networking model; Pod-to-Pod communication; Services (ClusterIP, NodePort, LoadBalancer, headless); DNS and service discovery; Ingress; Gateway API; NetworkPolicies; where service meshes fit (brief).
4. **Configuration and secrets** — ConfigMaps; Secrets; environment variables; mounted configuration; immutable ConfigMaps and Secrets; secret-management considerations (encryption at rest, external secret stores); security implications.
5. **Storage** — ephemeral storage; volumes; PersistentVolumes and PersistentVolumeClaims; StorageClasses and dynamic provisioning; access modes; CSI in one paragraph; StatefulSets with persistent data; snapshots, backup and restore considerations.
6. **Scheduling and resources** — requests and limits; QoS classes; how scheduling works; node selectors; affinity and anti-affinity; taints and tolerations; topology spread; ResourceQuota and LimitRange; priority and preemption; autoscaling concepts (detail in module 10).
7. **Reliability and health** — liveness, readiness and startup probes; rolling updates; rollout history and rollback; PodDisruptionBudgets; graceful shutdown (preStop hooks, termination grace period); failure scenarios.
8. **Security** — RBAC; ServiceAccounts; least privilege; Pod Security Admission and the Pod Security Standards; security contexts; network isolation; image security and supply chain (signing, SBOMs, scanning); secrets handling; admission control (validating and mutating webhooks; Kyverno or OPA Gatekeeper as ecosystem examples).
9. **Observability** — logs; metrics (resource metrics, kube-state-metrics, Prometheus-style architecture); traces (OpenTelemetry concepts); events; monitoring architecture; alerting; debugging unhealthy workloads.
10. **Scaling** — Horizontal Pod Autoscaler (`autoscaling/v2`); Vertical Pod Autoscaler concepts; cluster autoscaling; event-driven scaling (KEDA as an ecosystem example); bottlenecks; capacity planning.
11. **Deployments and DevOps** — CI/CD with Kubernetes; immutable images and tagging; rollout strategies; blue/green; canary; GitOps (Argo CD or Flux as examples); Helm; Kustomize; environment management.
12. **Production Kubernetes** — multi-environment strategy; cluster upgrades and version skew; etcd and disaster recovery; high availability; multi-tenancy; cost optimization; security posture; CRDs and Operators (extending Kubernetes); operational maturity; common production failure modes.
13. **Troubleshooting** — a systematic debugging workflow (`kubectl get`, `describe`, `logs`, `events`, `exec`, `port-forward`, ephemeral debug containers) applied to: CrashLoopBackOff; ImagePullBackOff; Pending Pods; readiness failures; DNS failures; Service connectivity; insufficient resources; scheduling failures; broken rollouts.
14. **Practical projects** — deploy a stateless web service; add service discovery; add configuration and secrets; add persistent storage; add health checks; implement autoscaling; implement a safe rollout; observe and troubleshoot the application. Interactive if the product supports exercises; otherwise steps plus expected outcomes.

## Appendix B — System Design curriculum

The course teaches reusable principles first, then applies them. It must not be "here is Netflix's architecture." Every topic below is mandatory; the partition is flexible.

### B1. Foundations

A repeatable design workflow with concrete examples at each step: clarify requirements → define scope → estimate scale → identify core entities → design APIs → choose storage → high-level architecture → find bottlenecks → add caching → add asynchronous processing → reliability → security → observability → explain trade-offs.

Concepts: functional and non-functional requirements; capacity estimation (back-of-envelope method, reference latency and throughput numbers); latency; throughput; availability; consistency and consistency models (CAP and PACELC at teaching depth); durability; scalability; reliability; idempotency; timeouts, retries, circuit breakers and backpressure; trade-off reasoning.

### B2. Distributed systems building blocks

For each: what it solves, why it exists, when to use it, when not to, major trade-offs, common failure modes. Load balancers; reverse proxies; CDNs; caches; relational databases; NoSQL databases; object storage; message queues; event streams; search indexes; workers; schedulers; service discovery; rate limiters; replication; partitioning and sharding; distributed coordination; API design and data modeling; observability; failure handling and disaster recovery.

### B3. Netflix-like streaming platform

- Requirements: accounts; profiles; catalogue; search and discovery; recommendations; playback; subtitles and audio tracks; watch history; continue watching; personalization; multiple devices.
- Architecture: clients; API gateway and edge; authentication; catalogue and metadata services; recommendation systems; playback services; content delivery and CDN (Open Connect as a publicly documented example); object storage; databases; caches; asynchronous pipelines; analytics and event systems; experimentation (A/B testing) in one lesson or section.
- Video delivery: why application servers must not stream video bytes; object storage; encoding and transcoding; segmentation; adaptive bitrate; CDN, origin, caching and regional distribution; DRM at concept level.
- Scale and reliability: massive concurrent viewing; traffic spikes; regional failures; cache efficiency; graceful degradation; multi-region strategy; observability; chaos engineering as a publicly documented practice.
- Trade-offs: why each major component exists.

### B4. Spotify-like music platform

- Requirements: accounts; artists; albums; tracks; playlists; follows; likes; search; recommendations; playback; offline capability; listening history; podcasts as a variation.
- Architecture: API layer; user, catalogue/metadata, playlist and playback services; recommendation pipeline; search; object storage; CDN; databases; cache; event streaming; analytics.
- Music delivery: audio encoding; object storage; CDN; streaming; caching; regional distribution; offline caching and rights at concept level.
- Recommendation architecture: event collection; feature generation; candidate generation; ranking; feedback loops; offline vs online processing.
- Playlist consistency: concurrent and collaborative edits; ordering; synchronization; conflict handling; caching; consistency trade-offs.
- Scale and reliability: large catalogue; massive listening-event volume; burst traffic; regional outages; graceful degradation.

### B5. YouTube-like video platform

- Requirements: upload; processing; playback; channels; subscriptions; comments; likes; views; search; recommendations; notifications; creator analytics; live streaming as an advanced lesson.
- Upload pipeline: upload request → resumable upload → object storage → metadata creation → queue or event → transcoding → thumbnail generation → validation and moderation (including copyright matching at concept level) → publishing → CDN distribution.
- Playback: manifests; segmented media; adaptive bitrate; CDN; cache; origin; hot vs cold content.
- Search: indexing; ranking; freshness; metadata; autocomplete; distributed search.
- Recommendations: candidate generation; ranking; personalization; watch history; feedback loops.
- Comments and engagement: huge write volume; pagination; moderation; abuse prevention; counters (views, likes) and eventual consistency; notification fan-out.
- Scale: storage volume; bandwidth; uploads; transcoding; view traffic; hot videos; regional failures.

### B6. Comparative architecture

Present the table, then teach beyond it: similar products need different architectures because their workloads and constraints differ.

| Concern | Netflix-like | Spotify-like | YouTube-like |
|---|---|---|---|
| Primary media | Long-form video; few titles per session | Short audio tracks; many per session | Video of every length; user-generated |
| Catalogue size | Tens of thousands of titles | Order of 10⁸ tracks; rich metadata and rights | Order of 10⁹ videos; long tail dominates |
| Ingest model | Curated, low-volume, high-touch studio delivery | Label and distributor delivery; structured metadata and licensing | Continuous massive user upload; resumable, validated, moderated |
| Processing | Encode each title once into many renditions; quality over speed | Per-track audio transcode; cheap and batchable | Transcoding at extreme scale where publish latency matters |
| Delivery | CDN + adaptive bitrate; predictable popularity, very cacheable | CDN + small files; prefetch and offline | CDN + adaptive bitrate; hot-video spikes over a long tail |
| Write traffic | Low (history, ratings) | Medium (playlists, likes, listening events) | Very high (comments, likes, views, uploads) |
| Consistency hot spots | Playback position across devices | Playlist edits; collaborative playlists | View and like counters; comment ordering |
| Recommendations | Personalized ranking over a small catalogue | Personalization plus audio and collaborative similarity; playlist generation | Personalization plus discovery over billions of items; freshness critical |
| Trust and moderation | Minimal (curated) | Low; rights enforcement | Central: abuse, spam, copyright matching |
| Real-time needs | Low | Medium (device sync) | High (live, notifications) |
| Monetization shape | Subscription | Subscription plus ad-supported tier | Ads, subscriptions, creator revenue share |

## Appendix C — Diagrams (minimum set)

Kubernetes architecture; Kubernetes request and network flow; Kubernetes deployment lifecycle (rollout); Netflix-like high-level architecture; Netflix-like video delivery path; Spotify-like high-level architecture; Spotify-like recommendation pipeline; YouTube-like upload pipeline; YouTube-like playback pipeline; YouTube-like recommendation and search architecture; comparative media-delivery architecture. Add diagrams elsewhere where they clearly help.

## Appendix D — Content validator: what it checks

1. Every course, module and lesson has the required metadata fields; difficulty is from the allowed set; durations are numbers.
2. Slugs are unique; module and lesson order is contiguous from 1.
3. No placeholder strings, case-insensitive: `TODO`, `TBD`, `FIXME`, `lorem`, `coming soon`, `placeholder`, `to be written`, `insert here`, `xxx`, `[...]`.
4. Required lesson sections are present and non-empty; optional sections, if present, are non-empty.
5. Lesson word count is within the configured bounds (fail below the minimum; warn above the maximum).
6. Internal links and cross-references resolve.
7. Every referenced diagram exists and has accessible text.
8. Fenced code blocks declare a language; YAML blocks parse; Kubernetes manifests have `apiVersion`/`kind` pairs from the allowlist and none from the deprecated list.
9. Every topic in coverage.json maps to at least one existing lesson, and every Appendix topic appears in coverage.json.
10. Runs as part of the test suite (or a script wired into CI) and fails the build on any error.

## Appendix E — Worker definitions for `.claude/agents/`

Three project subagents, checked into version control. Each is a Markdown file with YAML frontmatter; the body is the worker's system prompt. The operator copies them in before launch (§0); otherwise the agent creates them in Phase 2 step 5.

### `.claude/agents/lesson-author.md`

```markdown
---
name: lesson-author
description: Writes complete lessons for the course expansion from a delegation package. Use for content authoring in Phase 3 of docs/courses/SPEC.md.
tools: Read, Write, Edit, Glob, Grep, Bash
model: inherit
---

You write lessons for this repository's learning catalogue.

Before writing, read docs/courses/CONTENT_STYLE.md, the exemplar lesson named in
your task, and the accuracy rules in docs/courses/SPEC.md §5. Write only the files
named in your task, in the content format the task specifies. Every lesson has the
required sections; optional sections appear only when they carry real content.
No placeholders of any kind, no external URLs you have not fetched and confirmed,
and no private implementation detail of any company presented as fact.

When done, run the content validator on your files and fix what it reports.
Return: the files written, the validator result, and at most five lines of notes.
Do not paste lesson content into your reply. Do not edit any other file and do not
run git commands.
```

### `.claude/agents/content-reviewer.md`

```markdown
---
name: content-reviewer
description: Read-only review of drafted lessons for accuracy, style and completeness against the spec. Use after a module is drafted and before it is committed.
tools: Read, Glob, Grep, Bash
model: inherit
---

You review lessons against docs/courses/SPEC.md §5 and docs/courses/CONTENT_STYLE.md.
You do not edit files.

Check: factual accuracy for the pinned Kubernetes version and the API allowlist;
the three-level labelling in system-design lessons (publicly documented / accepted
industry architecture / teaching assumption) and any private detail presented as
fact; required sections present and non-empty; sections that only restate the
explanation; terminology and capitalization against the glossary; placeholders;
broken cross-references; code and YAML that would not run or apply; unverified
external URLs.

Return findings as a list of `path:line — issue — suggested fix`, most serious
first, then one line stating whether the module is ready to commit. Nothing else.
```

### `.claude/agents/check-runner.md`

```markdown
---
name: check-runner
description: Runs one verification command and reports only failures. Use to keep test, lint, typecheck, build and validator output out of the main context.
tools: Bash, Read, Grep
model: haiku
---

Run exactly the command given in your task. Return the exit code, then only the
failing items with file paths, line numbers and the error text, trimmed to what is
needed to fix them. If everything passes, return the exit code and "all passed".
Do not attempt fixes and do not edit files.
```

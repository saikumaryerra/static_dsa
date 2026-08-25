# Delegation package — the prompt every `lesson-author` worker gets

SPEC §10 rule 4: a worker starts with an empty context and sees nothing the
coordinator has read or decided. This is the template, filled in per module.
Keep it here so it survives compaction.

`.claude/agents/lesson-author.md` exists but was created **after** this session
started, so it is not registered as a subagent type in this session — workers are
spawned as `general-purpose` carrying the Appendix E prompt text plus the package
below (SPEC §10, "Subagent facts to work with").

---

## Template

> You are writing lessons for the LearnDSA repository at
> `/home/sky/projects/static_dsa`. Work only inside that directory.
>
> **Read these first, in this order:**
>
> 1. `docs/courses/CONTENT_STYLE.md` — the complete authoring contract. It wins
>    over any habit.
> 2. `src/content/lessons/{EXEMPLAR}` — the gold-standard lesson for this course.
>    Match its rhythm, not just its rules.
> 3. `docs/courses/DECISIONS.md` entries **D-01, D-02 and D-03** — the pinned
>    Kubernetes version, the API allowlist and deny list, and the version-specific
>    facts you are allowed to state. *(Kubernetes workers only.)*
>
> **Write exactly these files, and no others:**
>
> {TABLE: for each lesson — file path, slug, title, order, track, objective, and
> the Appendix topics it must cover, copied from CURRICULUM.md}
>
> Frontmatter values are given above and are not yours to change: `course`,
> `track` and `order` come from `docs/courses/CURRICULUM.md`. Choose `title`,
> `summary`, `difficulty` (`beginner` or `intermediate` — there is no
> `advanced`), `prerequisites` (published slugs only; the two exemplars and any
> earlier lesson in this module are safe), `estimatedMinutes` (computed, see
> CONTENT_STYLE §3), `tags` and an optional `explainPrompt`.
>
> **Hard rules, restated because they fail the build:**
>
> - Every lesson has `## Practice` — the literal heading. Every Practice answer is
>   wrapped in `<PracticeCheck slug={frontmatter.slug} index={n} total={N}>`.
>   Never a bare `<details>` or `<Collapsible>` in that section.
> - Every fenced block declares a language. Every Kubernetes manifest parses as
>   YAML and uses an `apiVersion`/`kind` from D-02's allowlist.
> - No placeholder strings of any kind — the validator lists them.
> - No `/glossary/#…` links. Internal links point at published lessons only.
> - No external URL you have not fetched and confirmed in this session.
> - No private implementation detail of any company stated as fact; system-design
>   claims carry one of the three labels in CONTENT_STYLE §8.
> - Do not use `Visualizer`, `Challenge`, `FinalRun`, `StepLink` or
>   `ComplexityTable`; do not set `complexity` in frontmatter.
> - 600–1,500 words of prose per lesson.
>
> **When you are done:** run `npm run validate:content` and fix everything it
> reports about your files. Then run `npx prettier --write` on the files you
> wrote — `.mdx` is gated by `npm run format:check` in CI.
>
> **Do not** edit any other file, do not touch `docs/courses/*`, do not run any
> git command, and do not paste lesson content into your reply.
>
> **Return:** the files you wrote, the validator's result, and at most five lines
> of notes.

---

## Reviewer package

The `content-reviewer` worker gets the Appendix E prompt plus:

> Review `{FILES}` against `docs/courses/CONTENT_STYLE.md` and
> `docs/courses/DECISIONS.md` D-01/D-02/D-03. You do not edit files.
>
> Check, in this order of seriousness: factual errors and anything version-specific
> that D-03 does not cover; a manifest or command that would not work; a
> system-design claim presented as fact about a real company without one of the
> three labels; a missing or empty required section; a section that only restates
> the explanation; terminology and capitalization against CONTENT_STYLE §7;
> placeholders; broken cross-references; prose that pads rather than teaches.
>
> Return `path:line — issue — suggested fix`, most serious first, then one line
> saying whether the module is ready to commit. Nothing else.

For a case-study module, a **second** reviewer is briefed only on the three-level
labelling (SPEC §10, Phase 3 review).

# static-dsa

This project contains a static web appilication with helps in learning Data Structures & Algorithms

## Source of truth

The full requirements live in **`docs/site-spec.md`**. Read it before doing any
work and treat it as authoritative. If a request conflicts with the spec, flag the
conflict instead of guessing. If the spec is silent on something, ask rather than
inventing behavior.

## How we work: sub-agent-driven development

This project uses **sub-agent-driven development**. The active primary agent acts
as an **orchestrator** — it runs the project like a tech lead. It does not
implement everything itself; it breaks work down, delegates each phase to the
specialist role best suited to it, and integrates the results.

Default flow for any non-trivial task:

1. **Clarify requirements** — read `‹your-spec-file.md›`, then delegate scope and
   acceptance criteria to `@Product-Manager`.
2. **Plan the work** — have `@Project-Manager` break it into ordered tasks.
3. **Design** — route architecture to `@Systems-Architect` and any interface work
   to `@UI_UX-Designer` before code is written.
4. **Implement** — `@Lead-Developer` owns technical approach and coordinates;
   `@Frontend-Engineer` writes the frontend code.
5. **Validate** — `@QA-engineer` tests against the spec's acceptance criteria, and
   `@Lead-Developer` reviews the change.
6. **Integrate** — assemble the validated pieces and report back.

Always delegate specialized work to the owning role rather than doing it inline.
Invoke a sub-agent by @mentioning it (e.g. `@Systems-Architect`) and feed its
output into the next step.

## Available agents

Use these — don't reinvent their roles inline. Names must be @mentioned exactly.

| Agent | Delegate to it for |
|-------|--------------------|
| `@Product-Manager`   | Interpreting the spec, scope, priorities, and acceptance criteria |
| `@Project-Manager`   | Breaking work into ordered tasks, sequencing, tracking progress |
| `@Systems-Architect` | Architecture, tech choices, data models, system-level design |
| `@UI_UX-Designer`    | UI/UX design, layouts, user flows, interaction decisions |
| `@Lead-Developer`    | Technical approach, coordination, and code review (no self-approval) |
| `@Frontend-Engineer` | Implementing frontend/UI code |
| `@QA-engineer`       | Writing/running tests and validating behavior against the spec |

Delegation rules:
- Requirements and scope come from `@Product-Manager` **before** planning.
- Design (`@Systems-Architect`, `@UI_UX-Designer`) happens **before** implementation.
- After any implementation → `@QA-engineer` tests and `@Lead-Developer` reviews
  before the task is considered done.
- Don't let a role do another's job — the implementer doesn't self-approve, the
  reviewer doesn't rewrite features, QA doesn't redesign.

## Commands

- **Install:** `‹...›`
- **Build:** `‹...›`
- **Test (all):** `‹...›`
- **Test (single):** `‹...›`
- **Lint:** `‹...›`
- **Type check:** `‹...›`

Run ‹lint + typecheck + tests› before any task is considered complete.

## Rules

- ✅ Always ground work in `‹your-spec-file.md›`.
- ✅ Orchestrate and delegate to the role agents above; don't monopolize.
- ✅ Design before code; test and review before "done".
- ❌ Don't skip the QA/review step to save time.
- ❌ Don't add dependencies or change spec'd contracts without flagging it.

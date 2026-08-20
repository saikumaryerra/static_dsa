# Redesign 2026-08 — the direction, as built

Read `00-interpretation.md` first: it fixes what the brief means for a static, no-account teaching
site, and `03-amendments.md` records every constraint this reopened. This document is the design
itself.

## Thesis

**LearnDSA is an instrument with a lesson wrapped around it, and the interface had it the other way
round.**

Everything true about this product comes from one architectural fact: an instrumented algorithm runs
once, emits a `Step[]` trace, and every surface — the drawing, the table, the prediction, the
challenge grader — is a *view* of that one recording. Nothing is animated, nothing is faked, and
stepping backwards is instant because it is only an index moving. That is a rare thing to be able to
claim, and the interface spent it badly: the drawing was a 774px figure inside a reading column, the
sentence explaining what to press sat *below* the thing it described, the run's table was folded
shut under both, and the code was two thousand pixels further down. A reader following *"watch `lo`
and `hi` close in"* had to hold the sentence in memory, scroll, and look.

The redesign is one move applied everywhere: **put the thing next to the words about it.**

Four principles follow.

1. **Adjacency over navigation.** If two things must be compared, they go next to each other. A
   scroll, a fold or a second page between them is a defect. This is what `<Bench>` is for, why the
   ledger is open, and why the home page mounts the real instrument instead of a picture of it.
2. **The reader's screen belongs to the machine.** The lesson page's third column is the
   instrument's, and everything that used to occupy it — a table of contents that could highlight
   but never name — had to justify itself against that.
3. **Nothing on this page is a copy of the product.** Where a surface shows what the product does,
   it does it. The hero still, and the 110 lines of CSS that kept it looking like the real renderer,
   are gone because the real renderer is cheaper than a faithful imitation of it.
4. **Say the default less.** Thirteen "BEGINNER" chips, an always-open input form, a continue line
   that repeats the button above it, a legend for pips that do not exist yet — each was one more
   thing between the reader and the algorithm.

The chrome stays achromatic. Not one colour token changed. *"Colour belongs to the machine; the
chrome spends none"* is why a running algorithm is the brightest object on a page, and the brief's
own §25 asks for exactly that register — calm, confident, no gradient/glass/blob theatre. What
changed is space, rhythm, type and structure.

---

## Information architecture

Routes are unchanged: `/`, `/learn`, `/learn/[slug]`, `/glossary`, `/about`, `/404`, plus
`robots.txt` and `sitemap.xml`. **No route was added.** On a static teaching site every new page costs
a wayfinding decision and buys nothing that an anchor could not, and the mega-brief's IA sections —
auth, enrolment, dashboards, admin — describe a product that does not exist here.

Global nav stays three links plus the theme toggle, with no hamburger: three items do not need a
disclosure island, and `SiteHeader` keeps shipping zero script.

The mental model a reader ends up with:

> *Fifteen lessons in two tracks. Each one is a machine I can run, with the explanation beside it and
> the run written out as a table. My browser remembers what I have read, and nothing else happens.*

---

## The lesson

### Composition

| width | layout |
|---|---|
| **≥1200px** (and ≥640px tall) | Reading column + a **pinned instrument pane** (`--stage-w: 35rem`). Prose scrolls; the machine stays. |
| **1024–1200px** | One column; benches stack. Sticky "On this page" bar. |
| **768–1024px** | One column; the instrument keeps its card. |
| **<768px** | One column, instrument full-bleed (RSP-2's negative margin), ledger well capped at 12rem. |

```
≥1200px                                            <1200px
┌──────────────────────────┬──────────────────┐    ┌──────────────────┐
│ Intuition                │ ┌──────────────┐ │    │ Intuition        │
│ prose scrolls…           │ │ 1 3 5 [7] 9  │ │    │ prose            │
│ ………………………………             │ │ ▔▔▔▔▔▔▔      │ │    │ ……………………         │
│ How it works             │ │ lo        hi │ │    │ How it works     │
│ …that is step 2 ─────────┼▶│ mid 2 holds  │ │    │ ……………………         │
│ in the run.              │ │ 5 < 7        │ │    ├──────────────────┤
│ ………………………………             │ │ ◀ ▶ ▶▏ Predict│ │   │ ┌──────────────┐ │
│                          │ ├──────────────┤ │    │ │  the drawing │ │
│                          │ │ # lo mid hi  │ │    │ │  transport   │ │
│                          │ │ 2  0  2   5  │ │    │ │  the run     │ │
│                          │ └──────────────┘ │    │ └──────────────┘ │
└──────────────────────────┴──────────────────┘    └──────────────────┘
  the pane stays put while the prose moves          source order, unchanged
```

The two columns are a **grid placement, never a reordering**. DOM order inside a bench is heading →
prose → instrument, which is exactly what the lesson shipped before, so a phone, a printed page and a
screen reader all get the sequence the prose was written for. Nothing is hoisted.

### What is on screen while a reader steps

The drawing, the `aria-live` sentence, the transport and the step counter — at every width. In the
pinned pane the ledger's tail is the only thing that can fall below the fold, and it is the one
region a reader chooses to look at rather than needs in view. Measured: the instrument is 872px of
content and a 1280×900 laptop leaves it 804, so the pane keeps a scroll of its own as the safety net.

### The three views of one trace

- **The drawing** — SVG, the renderer's output for the current step.
- **The run, written out** — the ledger, one row per `Step`, value cells reading `step.state` and
  nothing else, "what happened" taken verbatim from the authored explanation. Now **open by
  default**, because it is the best explanatory artifact the product has and it was folded shut.
- **The prose** — which can point *into* the run: `<StepLink>` resolves a sentence to a row, and with
  the instrument pinned that row is now on screen when the reader clicks it.

The three-language code tabs are deliberately **not** claimed as a fourth synchronised view. They are
hand-authored translations; nothing in the build can prove they match the trace, so the design does
not pretend they do.

### Sections

Six h2s, not seven: Intuition, How it works, Complexity, Code, Common pitfalls, Practice. The
`## Visualizer` section is gone — the visualization lives inside "How it works", which is where its
explanation always was. This was already permitted by the shipped test contract (see amendment S-1).
The `#visualizer` anchor survives on the first bench.

`<Bench>` also carries the complexity table (artifact right, explanation left) and the Final Run card
(artifact right, practice questions left). `<Band>` lays Trace Trials out two-up. Between them, the
lesson has no section that sits in a half-empty page except Code and Common pitfalls, which are
reference material where a reading measure is correct.

---

## Home

Five sections, each with one job, and nothing fabricated.

1. **Hero** — the display heading, one paragraph, "Start with lesson 01", and **the real instrument,
   running**. A visitor can press Play before they have navigated anywhere.
2. **What a lesson actually does** — three claims, each about something visible in the instrument
   directly above it rather than about the product in the abstract.
3. **15 lessons, two tracks** — the actual curriculum, every lesson named, numbered, timed and
   linked. A visitor deciding whether this covers what they came for should not have to take a
   summary's word for it, and fifteen named links are fifteen ways in.
4. **What it costs you** — no account, no tracking, progress stays on the device, works offline and
   with JavaScript off. The product's own non-promises, stated plainly. This is the honest answer to
   "what is the catch", and it is the only "differentiator" section on the page because it is the
   only one with evidence behind it.
5. **Close** — one last way in.

There are no testimonials, ratings, user counts, logos or benchmarks anywhere, because the product
has never been publicly measured and inventing one would be the worst thing this page could do.

---

## `/learn`

Kept at `--container-max` — a three-column card grid does not need a wider shell, and widening it
would only move the empty space. The change that mattered is **badging the exception**: thirteen of
fifteen lessons are `beginner`, so the chip now appears only on the two that are not, and those two
are finally visible at a glance.

The returning-reader surface — resume CTA, learning days, review strip, track rings, per-card mastery
pips — is unchanged. It already renders nothing rather than an empty shell for a first-time visitor,
which is the invariant the brief's "dashboard" section actually wants here.

---

## Glossary

Two columns from 900px (`10,881px → 7,745px` at 1280px) and a **filter**, which spec §19 had left
open as an owner decision. It filters markup already on the page — no index, no fetch, no store — and
matches the term, its aliases and its definition, so half-remembering a description finds the word.
It ships hidden and the island reveals it; with JavaScript off the complete A–Z and its jump nav are
untouched.

---

## The design system

| token | was | now | why |
|---|---|---|---|
| `--font-sans` | system stack | IBM Plex Sans, self-hosted | the human's voice, identical on every OS |
| `--font-mono` | system stack | IBM Plex Mono, self-hosted | **the machine's voice**, and now a deliberate pair with the sans |
| `--shell` | — | `90rem` | reading column + instrument stage |
| `--container-max` | `72rem` | `72rem` | unchanged; still the measure-led shell |
| `--measure` | `70ch` | `68ch` | Plex sets wider than the stack it replaced |
| `--stage-w` | — | `35rem` | measured against the instrument's own 32rem container query |
| colour | achromatic | achromatic | **not one token changed** |
| spacing, radii, motion, elevation | — | unchanged | they were right |

New components: `Bench`, `Band`. Retired: the ToC rail (kept in source, rendered nowhere), the home
page's hand-restated renderer CSS, and the `.viz-custom__legend` that has become a real control.

Motion is unchanged and stays informational: every duration still comes from a `--duration-*` token,
and `prefers-reduced-motion` still collapses them in one place.

---

## States

- **Loading** — nothing on this site loads at runtime; the visualization's pre-hydration state is a
  real still of step 0 with disabled controls, which is the honest "not yet interactive".
- **Empty** — the review strip still renders zero DOM when there is nothing due; the glossary filter
  has a designed no-match state that says what to do next rather than apologising.
- **Error** — the custom-input error is unchanged (`role="status"`, focus moved to the offending
  field, the persistent format hint left in place so the reader can act instead of guessing).
- **Success** — unchanged: the run recomputes and the explanation announces.
- **JS off** — every M8 control still disappears entirely; the ledger, being M7-class content, now
  *prints and renders open*, so a script-blocked reader gets the complete worked example rather than
  a still and a note.
- **Forced colors / print** — both still supported; benches and bands collapse to one column on
  paper, and `position: sticky` is explicitly reset there.

---

## What this deletes

- The 15rem ToC rail from every lesson page.
- The `## Visualizer` section from every lesson that had one.
- The home page's static hero still, its frame-picking derivation, its build-time class-contract
  assertion and ~110 lines of restated renderer CSS.
- Thirteen redundant "BEGINNER" chips.
- The always-open custom-input form (now one labelled click).
- The duplicated continue line on a first visit.
- `--rail-w`, and the paired heading `scroll-margin-top` rules that differed by breakpoint.

---

## Risks, and what covers them

| risk | cover |
|---|---|
| A pinned pane taller than a short viewport | measured; capped with an internal scroll whose overflow is only the table's tail |
| The instrument is narrower pinned (545px) than it was inline (824px) | the canvas already scrolls horizontally inside itself under RSP-2's floor, a tested path; and 545px is closer to the renderers' natural width than 824 was |
| Content drifting outside the font subset | `tests/unit/font-charset.test.ts` fails the build's test gate and names the file |
| Deliberate test breakage read as regression | every one is enumerated in `03-amendments.md` with its spec file |
| JS on `/` where there was almost none | `tests/e2e/js-budget.spec.ts` prints the real per-page table on every run |


---

## Considered and not done

Recorded so the decisions stay decided, and so the gaps are gaps on purpose.

- **Site-wide search.** The brief asks for search as a core capability. Fifteen lessons, all of them
  listed by name on the home page and on `/learn`, do not need one — a search box over fifteen items
  is a slower way to use a list you can already read. The glossary is the surface where recall
  genuinely fails (forty-six terms, and the reader half-remembers the description rather than the
  word), which is why the filter went there and nowhere else.
- **A synchronised code view.** The strongest remaining idea: a third view of the trace, where the
  current `Step` highlights the line of code it is executing. It is not built because the three
  language tabs are hand-authored translations and nothing in the build can prove one matches the
  trace — claiming synchrony the build cannot enforce would break the product's own "nothing is
  faked" rule. Doing it honestly means short pseudocode shipped in the same module as the emitter,
  indexed by a new `Step.line`, with drift as a build failure. That is a real feature with a real
  design, not a polish item.
- **A prerequisite graph on `/learn`.** The `prerequisites` frontmatter is a real DAG (five
  topological layers, one root, 23 edges) and drawing it would make the curriculum's shape visible.
  Left undone: the two-track grouping already carries most of that information, and a second
  navigational model on the same page costs more than it explains.
- **`/learn` and `/about` were left largely as they were.** `/learn`'s returning-reader block —
  resume CTA, learning days, review strip, track rings, per-card pips — already renders nothing
  rather than an empty shell for a first-time visitor, which is the invariant that matters; it got
  the difficulty-chip change and nothing else. `/about` got one copy correction ("an animation you
  control" → "a visualization you can step through", because the product's whole positioning is that
  it is *not* an animation). Effort went where the product's differentiator lives.
- **Hiding `/learn`'s reset control and pip legend until there is progress.** Correct on the merits —
  both explain machinery a first-time visitor has not met — and not done, because the reset control
  is load-bearing in twelve e2e assertions and the change would have been indistinguishable from a
  regression in the same run as everything else. Worth doing on its own.

# Redesign 2026-08 — spec amendments

Every Tier-2 constraint this redesign reopened (see `00-interpretation.md`), with what changed, why,
and which test had to be updated **deliberately** rather than deleted. Nothing in Tier 1 moved: no
backend, no new storage key, no behavioral tracking, no fabricated evidence, no killed mechanic
resurrected, no new npm dependency, and every surface still works with JavaScript off.

The sign-off is the brief's own sentence — *"You can deviate from limits and change spec limits or
constraints"* — plus, for the two decisions a person had to make, the answers given at the
2026-08-20 checkpoint: **the sticky instrument pane** and **self-hosting one typeface**.

---

## T-1 · The typeface

**Was** the system stack (`system-ui, -apple-system, "Segoe UI", Roboto, …`), chosen in M1 for a
0-byte cost, with §19 leaving "final font" open and §14 asking for "self-host fonts; preload" —
which M1 satisfied vacuously.

**Now** IBM Plex Sans and IBM Plex Mono, self-hosted, subset, preloaded.

**Why.** The system stack was never a choice about character; it rendered the product as a
different-looking thing on every operating system, and it is the single reason a well-built site read
as an unstyled one. Plex was chosen over Inter, Source Sans 3 and Public Sans on a **rendered**
comparison of the real hero, a real lesson heading, body prose, the ledger's numerals and a code
block — not on reputation. It won on two grounds specific to this product: its register is
engineering documentation, which is the subject's own world; and sans and mono are one family, which
makes the split this product depends on deliberate rather than accidental — the sans is the human's
voice and the mono is **the machine's** (step counters, ledger values, `lo`/`mid`/`hi`, metrics,
code). Before this, the machine spoke in whatever mono the reader's OS happened to ship.

**Measured, not estimated** (`src/styles/font-charset.ts` holds the numbers and a test asserts them
against the files on disk):

| file | bytes |
|---|---|
| `public/fonts/plex-sans.woff2` | 60,020 |
| `public/fonts/plex-mono.woff2` | 17,684 |
| **total** | **77,704 (75.9 KB)** |

Fonts are assets, not scripts, so the §4 "≤ 60 KB gzipped **per lesson page**" budget — which
`tests/e2e/js-budget.spec.ts` measures by gzipping the *script* closure — is unaffected. Reporting
this as a budget change would be misreporting it.

**The glyph blocker, and how it was solved.** Google Fonts' stock `latin` subset of *every* candidate
face lacks `→`, which this site's chrome sets sixty-odd times, along with `✓ ≥ ≤ ≈ ⁿ ₂`. That was
measured with CDP `CSS.getPlatformFontsForNode`, which reports the physical font the engine actually
resolved each glyph to — a `unicode-range` in the returned CSS says what was *requested*, not what
the file contains. The full upstream variable file covers them and is 352 KB. So `npm run fonts`
(`scripts/build-fonts.mjs`) requests a subset cut to exactly the characters this repo can render,
**derived by scanning `src/`** rather than hand-listed, in the same spirit as the OG card being
generated from the real renderer. Eleven geometric markers (`▲ ▶ ▼ ✕ ⌀ ∅ ⋯ ⁿ` and three
comment-only arrows) are still drawn by the reader's system font — exactly as they always were,
since they have only ever been set in the system stack.

**No italic file.** The italic subset measured 66,980 bytes to serve a few dozen short `<em>` spans;
browsers synthesise an oblique from the variable upright. Revisit if emphasis becomes load-bearing.

**CLS.** `size-adjust` / `ascent-override` / `descent-override` for the fallback faces are measured
in a shaping engine against Arial's metrics and written into `tokens.css` by the same script, so the
line box does not change height when the swap lands. A side benefit worth naming: the CI visual
baselines stop depending on whatever fontconfig resolves in the container, which is the flakiness
`README.md` warns about.

**Tests.** `tests/unit/font-charset.test.ts` is **new**: it re-derives the character set from `src/`
and fails if a character appears that the committed subsets do not cover, asserts the byte sizes
against the files, and pins the list of glyphs left to the system fallback. Adding a lesson with a
new symbol is now a failing test that says "run `npm run fonts`", not a silent fallback mid-word.

---

## L-1 · Two shells instead of one

**Was** `--container-max: 72rem` as the site's only width.

**Now** `--shell: 90rem` for pages with a genuine third column (the lesson), `--container-max` for
measure-led pages (`/about`, `/404`, `/glossary`, `/learn`). `BaseLayout` takes a `wide` prop.

**Why.** On a 1440px screen a lesson gave the visualization — the entire differentiator — 824px
inside the reading column, spent 240px on a table of contents, and left ~170px permanently empty.
Widening a shell that only ever holds one column of prose just moves the empty space, which is why
this is a prop and not a global change.

`--measure` went `70ch → 68ch` at the same time: Plex sets wider than the system stack it replaced,
so 70ch was a longer line than the one M2 measured and approved.

---

## L-2 · `<Bench>` — the instrument beside the prose

**Was** a lesson body as a single stream: prose, then a figure, then the sentence describing the
figure you had just scrolled past, then the run's table folded shut under both.

**Now** `src/components/Bench.astro`. A bench pairs **one** artifact with the prose that narrates it.
At ≥1200px and ≥640px tall the prose scrolls in the reading column while the artifact stays pinned
beside it; below that it is exactly the stack it always was. `<Bench solo>` opts a bench out of the
split where its prose is too short to give the pin any travel.

**DOM order is the mobile order and is unchanged** — heading, prose, instrument. The two columns are
a grid *placement*, never a reordering, so a narrow screen, a printed page and a screen reader all
get the sequence the prose was written for. Nothing is hoisted.

**The content moved with it.** For the pin to be worth anything the prose beside it has to be the
prose that explains it, so `## Intuition` and `## How it works` now live *inside* the first bench,
and the per-algorithm bullets in multi-instrument lessons moved into their own benches. This is the
part of the redesign that touched all fifteen lesson files.

`src/components/Band.astro` is its opposite number: a run of peer cards (Trace Trials) laid out
two-up at the same breakpoint, so a pair of small equal things stops reading as a list of
one-and-then-another.

**Also benched:** the complexity table (artifact right, its explanation left) and the Final Run card
(artifact right, the practice questions left).

---

## L-3 · The 15rem ToC rail is retired

**Was** a sticky rail at ≥1024px plus a sticky "On this page" bar below it — two implementations of
one idea, and the rail owned the column the instrument now needs.

**Now** the bar runs at every width. `.toc--rail` is retained in `TableOfContents.astro` for any
future surface that wants a static list; nothing renders it.

**Why the bar is the better of the two, independent of the space:** it names the section you are
**in** (`data-toc-current`, filled by the same scroll-spy that used to only tint a rail entry). The
rail could show a highlight but never a label, so on a 9,000px lesson it answered "where am I" only
if you looked away from what you were reading.

**Tests.** `tests/e2e/m7-wayfinding.spec.ts` asserted the rail's presence at ≥1024px; those
assertions move to the bar. The heading `scroll-margin-top` is one rule again (`--header-h +
--toc-bar-h + space`) instead of a pair that differed by breakpoint.

---

## S-1 · Five or six body sections, not seven

**Was** spec §7's seven-section body, including `## Visualizer`.

**Now** the visualization lives inside `## How it works`, and the `## Visualizer` heading is gone
from the lessons that had one. The six that remain — Intuition, How it works, Complexity, Code,
Common pitfalls, Practice — are unchanged and still required.

**This was already within the shipped contract.** `tests/e2e/m4-lessons.spec.ts` has said since M4
that *"multi-algorithm lessons legitimately fold the interactive viz into 'How it works', so the
literal 'Visualizer' heading is optional"*. The redesign makes every lesson that shape.

**The `#visualizer` anchor survives** as an id on the first bench, because the home hero links to
`/learn/binary-search#visualizer` and an external link may too.

**Tests.** `tests/e2e/binary-search.spec.ts` hard-coded all seven headings; it asserts six.

---

## F-1 · "Watch it happen" points at the instrument

**Was** `FinalRun` resolving its anchor to the *heading* a `<Visualizer>` sat under, falling back to
`#visualizer`.

**Now** it derives the instrument's own id through `instrumentIdFor` — the same read-only half of the
function `<StepLink>` uses and `Visualizer.astro` claims with — reading the renderer id out of the
very tag it already located.

**Why.** The heading was the best available answer while the drawing sat a screenful below its own
`##`. It is no longer where the drawing is, and on binary search there is no `## Visualizer` heading
left to fall back to. The build now fails if no matching `<Visualizer>` tag exists, which is a
truthful check where the old one had become a proxy. An *authored* `anchor` prop is still validated
against the real heading ids.

---

## C-1 · The ledger is open by default

**Was** `<details>`, closed.

**Why it changed.** The single best explanatory artifact this product has — the run written out, one
row per step, provably the same trace the drawing is showing — was a line of grey text a reader had
to guess was worth clicking. "Show your work" cannot be the thesis and also be folded shut.

The well is bounded (18rem, 12rem on a phone, `min(18rem, 26vh)` in a pinned pane) and every row
stays in the DOM, so a 200-row run costs a fixed height and scrolls inside itself. It is still a real
disclosure. Two side effects, both good: it now **prints** open (no stylesheet can open a closed
`<details>`), and **axe scans it on every run** rather than skipping it as `display: none` — the
blind spot spec §18 records.

---

## C-2 · Custom input is behind a disclosure

**Was** the "Try your own input" form, always open.

**Now** a `<details>` labelled **"Run it on your own input"**, directly under the transport.

**Measured reason.** On a 390px phone the controls region was 550px tall, of which this form was 300
— a reader who stepped the algorithm and wanted the next sentence scrolled past a form they had not
asked for. In a pinned stage column the whole instrument has to fit one viewport, which it does not
with the form permanently open. The summary is a real control that promises the thing the product is
proud of; the `<p>` legend it replaces said the same words with no way to act on them.

§10's "run each algorithm on your own input" is unchanged — it is one click, from a labelled control
in the same place the old legend was.

**Tests.** `tests/e2e/m7-player-v2.spec.ts` and any spec that types into the custom-input fields must
open the disclosure first.

---

## C-3 · The instrument measures itself, not the window

**Was** `@media (min-width: 640px)` deciding the control bar's layout.

**Now** `@container viz (min-width: 32rem)`, with `.viz` declaring `container: viz / inline-size`.

**Why.** The same instrument now appears at three very different widths on one viewport — full-bleed
on a phone, ~1150px in a solo bench, ~545px pinned in a stage column. The viewport query put
transport, scrubber and speed on one row inside a box that could not hold them, and the speed label
landed on top of the slider.

**32rem is measured twice.** A container query resolves against the **content** box, and `.viz`
carries a 1px border from 768px up — so a 545px pane queries as 543px and a 34rem (544px) threshold
missed it by one pixel on each side. 512px is also the honest floor for the row.

---

## D-1 · Difficulty chips badge the exception

**Was** a neutral chip on all fifteen curriculum cards. §19 listed this as needing designer sign-off.

**Now** the chip appears on a `/learn` card only when the difficulty is **not** `beginner` — two
cards out of fifteen.

**Why this is the original decision carried forward, not reversed.** `design-tokens-m1.md` made the
chips neutral because *"colouring thirteen beginner lessons as loudly as two intermediate ones would
invert the exception they exist to signal"*. Saying the default word thirteen times does the same
damage more quietly. **The lesson page keeps its chip unconditionally**: a reader arriving from a
search result has no comparison set in front of them, so the word is metadata rather than noise. The
rule is about the grid, not the chip.

---

## G-1 · The glossary has a filter

**Was** deferred in §19 as an owner decision — *"Glossary search island (~1 KB)"*.

**Now** shipped. It filters markup that is already on the page: no index, no fetch, no store, no
debounce. It matches the term, its aliases **and** its definition, because a reader who half
remembers "the one about wrapping around" should find `Circular buffer`. It ships `hidden` and the
island reveals it — a text field that cannot filter is worse than no field. The A–Z nav is hidden
while a filter is active, because its chips would jump to letters that are now empty.

Result counts are stated in words (`4 terms matching "hash"`), never as a ratio, so the calm
vocabulary rules hold. The no-match state says what to do next rather than apologising.

## G-2 · The glossary is two columns

Forty-six definitions in one column made a 10,881px page whose right half was empty at every scroll
position. Multi-column (not grid — a dictionary flows, and grid rows would align every letter group
to the tallest in its row) from 900px, with `break-inside: avoid` so no letter heading is orphaned.
**Measured: 10,881px → 7,745px at 1280px.**

---

## H-1 · The home hero mounts the real instrument

**Was** a still: a frozen frame of binary search, produced by the real renderer so it could not
drift, with "Play it in the lesson →" underneath.

**Now** the same `<Visualizer>` island a lesson uses, on the same trace, with its ledger open.

**Why.** A product whose entire claim is *you can step through this* opened by showing a photograph
of stepping through it and asked the visitor to navigate twice before the claim could be checked. It
is not "kept in sync" with the lesson any more — it **is** the lesson's instrument.

**What it deleted:** ~130 lines from `src/pages/index.astro` — the `renderStatic` call, the
frame-picking derivation, the build-time assertion that the renderer still emits nine class names,
and ~110 lines of `.hero-demo__canvas :global(…)` CSS that restated the renderer's own stylesheet
because the still was drawn outside the island that owns it. All of it existed to keep a hand-placed
copy of the product in step with the product.

**Cost:** `/` now ships the player, the array renderer and the binary-search algorithm chunks where
it previously shipped 1.7 KB gz of resume-line logic. `tests/e2e/js-budget.spec.ts` prints the real
per-page table on every run; read that number rather than one copied into a doc.

`allowCustomInput={false}` on the hero only: the custom-input form is the one control that needs its
own explanation (formats, caps, a target field), and the hero's job is to get a stranger to press
Play. The lesson two clicks away does the rest, and the third promise on the page says so in words.

## H-2 · The continue line is for returning readers only

It used to ship visible and server-rendered pointing at lesson 01, so a JS-off reader had a true
link. The primary CTA now says exactly that — "Start with lesson 01" — so on a first visit the two
said the same thing twice, one under the other. It ships `hidden` and the island reveals it only
once it can see at least one completed lesson on this device. Nothing is lost with JavaScript off:
the CTA above is the same destination.

---

## Not reopened, and why

- **The achromatic chrome.** Not deference — it is the best idea in the system. "Colour belongs to
  the machine; the chrome spends none" is why a running algorithm is the brightest object on screen,
  and the brief's own §25 asks for exactly that register. Not one colour token changed.
- **Every mechanic killed on ethics or pedagogy** in `docs/m8-gamification.md` — XP, levels, badges,
  streaks, leaderboards, certificates, timed challenges, personal bests, decay. The brief agrees
  (§32).
- **The two deletions settled by measurement** in spec §19.1 — cost withholding and a vertical
  legibility floor for RSP-2. Neither was re-proposed; nothing here adds a `max-height` or an
  `overflow` to any SVG canvas.
- **Social proof of any kind.** There are no testimonials, ratings, user counts, logos or benchmarks,
  because the product has never been publicly measured. The home page says what it costs you
  instead, which is the true thing it has to say.

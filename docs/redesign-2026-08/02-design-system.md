# Redesign 2026-08 — the design system

`src/styles/tokens.css` is the live source of truth. This file records the **decisions** behind the
tokens that moved, and the measurements they were made on. `03-amendments.md` records what each one
reopened.

## Typography

### How the face was chosen

Four candidates were cut to this site's own character set and rendered against real content — the
hero heading at its display size, a lesson `h2`, body prose at 17px, the binary-search ledger with
its numerals, and a Python code block. The comparison was made on the pictures, not on reputation.

| face | subset | verdict |
|---|---|---|
| **IBM Plex Sans** | 62,356 B | **chosen.** Engineering-documentation register — the subject's own world. Distinctly drawn (the flared `l`, the open `a`, the tail on `y`) without being mannered. Pairs with a mono by the same designer. |
| Inter | 54,704 B | Superb, and the single most-used UI face on the web — the templated default. Nothing about it is *this* product. |
| Source Sans 3 | 35,280 B | Warm and literary, and the lightest of the four; noticeably softer at display sizes, and the body colour read thin next to Plex at the same weight. |
| Public Sans | 32,632 B | Neutral to the point of anonymous. Also the worst glyph coverage of the four. |

### Two faces, because the product has two voices

The split was already latent in the markup and is now deliberate:

- **IBM Plex Sans** — the human's voice: prose, headings, chrome, labels.
- **IBM Plex Mono** — *the machine's*: step counters, ledger values, `lo`/`mid`/`hi`, indices,
  metric pills, inline code, code blocks, and the renderer's own SVG text.

Before this, the machine spoke in whatever monospace the reader's operating system happened to ship,
which meant the most characteristic thing on the page was the least controlled. One family, two
roles, one designer.

Plex Mono also sits in the **sans** stack, immediately after the sans fallback: any glyph Plex Sans
lacks but Plex Mono has is then drawn by its own sibling at a compatible weight, rather than by an
unrelated serif.

### The glyph problem, and why the subset is generated

Google Fonts' stock `latin` subset of **every** candidate lacks `→`, which this site's chrome sets
sixty-odd times, along with `✓ ≥ ≤ ≈ ⁿ ₂ ▶`. That was not assumed: each character was rendered and
the physical font the engine resolved it to was read back through CDP
`CSS.getPlatformFontsForNode`. A `unicode-range` in the CSS Google returns says which codepoints
were *requested*, not which ones the file contains — the two disagree here.

The full upstream Plex Sans variable file covers them and is **352 KB**.

So `npm run fonts` (`scripts/build-fonts.mjs`) requests a subset cut to exactly the characters this
repo can render, **derived by scanning `src/`** — printable ASCII, Latin-1 Supplement and Latin
Extended-A for headroom, plus every non-ASCII printable the repo actually contains. It then verifies
in a shaping engine that every one of them resolves to the downloaded face, and fails loudly if not.
That is the same posture as the OG card being generated from the real renderer: a hand-listed set
drifts the moment a lesson gains a character, and the failure is silent.

**Eleven glyphs are still drawn by the reader's system font** — `▲ ▶ ▼ ✕ ⌀ ∅ ⋯ ⁿ` and three
comment-only arrows. Every one is a geometric marker the site has *only ever* set in the system
stack (visualizer carets, the delete mark, null/empty symbols, the legend's comparing and range
swatches, the superscript in `O(2ⁿ)`), so self-hosting did not move them. They are listed in
`src/styles/font-charset.ts` and pinned by a test, so a **new** one is a decision to make rather
than a fact to absorb.

### CLS

`size-adjust`, `ascent-override` and `descent-override` for the two fallback faces are measured in
the shaping engine against Arial's metrics by the same script and written into `tokens.css`, so the
line box does not change height when the swap lands. `font-display: swap` alone would not do this.

| file | size-adjust | ascent | descent |
|---|---|---|---|
| `plex-sans.woff2` | 101.82% | 101.16% | 27.50% |
| `plex-mono.woff2` | 128.42% | 80.20% | 21.80% |

**Total committed font bytes: 77,704 (75.9 KB).** Fonts are assets, not scripts — the §4 budget
(`≤ 60 KB gzipped per lesson page`) gzips the *script* closure and is unaffected. A lesson measures
~18.4 KB gz of JavaScript after the redesign.

No italic file: the italic subset measured 66,980 B to serve a few dozen short `<em>` spans, so
browsers synthesise an oblique from the variable upright.

## Layout

| token | was | now | note |
|---|---|---|---|
| `--shell` | — | `90rem` | pages with a third column, via `BaseLayout`'s `wide` prop |
| `--container-max` | `72rem` | `72rem` | unchanged; the measure-led shell |
| `--measure` | `70ch` | `68ch` | Plex sets wider than the system stack |
| `--stage-w` | — | `35rem` | the pinned instrument's column |
| `--rail-w` | `11.5rem` | *deleted* | the ToC rail is retired |

`--stage-w` is not a round number by accident. `.viz` is a container-query context; the control bar
takes its one-row layout at `36rem` of **content** width. A 35rem stage gives `.viz` 545px
border-box → 543px content, which is deliberately *below* that line: one row fits on paper (transport
~300 + counter 40 + speed ~116 + gaps 32 = 488 against ~495 usable) and fails in practice, wrapping
the step counter at 7px of slack. The pane therefore takes the two-row bar on purpose, and the 44px
it costs is affordable because the legend and counters now sit below the transport.

## Colour

**Not one token changed.** The chrome is achromatic: `--brand` is byte-identical to `--text`, and the
six `--hl-*` visualization roles plus `--accent-warn` are the only hue anywhere. That is why a
running algorithm is the brightest object on a page, and it is the best idea in the system.
`tests/unit/tokens-contrast.test.ts` still guards the matrix.

## Instrument order

The instrument is ordered by what a reader needs in view while they step:

```
drawing → the sentence about it → the transport → the key → the input → the run
```

The key (legend + counters) moved **below** the transport. Measured reason: in a pinned stage column
the whole instrument has to fit one viewport, and on the four lessons with a tall drawing — the
graph, the tree, the call stack, the DP table — 88px of pills above the transport was exactly what
pushed Play below the fold at 1440×900.

## Components

| component | status |
|---|---|
| `Bench` | **new** — one artifact + the prose that narrates it; pinned at ≥1200px and ≥640px tall |
| `Band` | **new** — peer cards, two-up at ≥1200px |
| `TableOfContents` `variant="rail"` | retained in source, **rendered nowhere** |
| `DifficultyChip` | unchanged; `/learn` cards now render it only for the exception |
| the home page's hand-restated renderer CSS | **deleted** — the hero mounts the real island |
| `.viz-custom__legend` | **deleted** — replaced by a real disclosure control |

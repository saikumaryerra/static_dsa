// Client module for the lesson's "On this page" bar
// (`src/components/TableOfContents.tsx`): the legacy `LessonLayout.astro`'s
// first `<script>`, moved verbatim (React migration plan §5 P2 WS-C
// step 4). Loaded as a `<script type="module">` on every page that renders the
// component.
/**
 * Scroll-spy v2 (M7.2) — progressive enhancement (design §1.3): highlight the
 * ToC entry for the section being read, and name it in the mobile mini-ToC
 * bar. The ToC is fully usable (anchor nav) without any of this.
 *
 * v1 asked an IntersectionObserver for "the first heading inside a narrow
 * band", so on a 7,300px lesson NO entry was current for the ~90% of scroll
 * positions where no heading sits in the band. v2 tracks "the LAST heading
 * whose top has passed the band" against cached offsets, which yields exactly
 * one current entry at every scroll position — above the first heading (it
 * stays current) and at the very bottom of the page alike. Because it reads
 * live scroll positions on every frame, MOT-1's smooth scrolling resolves
 * correctly the whole way and settles on the jumped-to section.
 */
const links = Array.from(
  document.querySelectorAll<HTMLAnchorElement>('[data-toc-link]'),
);

// Each heading id maps to all matching ToC links (the inline bar and the rail
// render the same list), in document order.
const linksById = new Map<string, HTMLAnchorElement[]>();
const ids: string[] = [];
const headings: HTMLElement[] = [];
for (const link of links) {
  const id = (link.dataset['tocLink'] ?? '').slice(1);
  if (!id) continue;
  const group = linksById.get(id);
  if (group) {
    group.push(link);
    continue;
  }
  const heading = document.getElementById(id);
  if (!heading) continue; // a ToC entry with no heading can never be current
  linksById.set(id, [link]);
  ids.push(id);
  headings.push(heading);
}

if (headings.length > 0) {
  const currentLabel =
    document.querySelector<HTMLElement>('[data-toc-current]');
  /** Document-space top of each heading; recomputed whenever layout can change. */
  let tops: number[] = [];
  /** Y offset of the "you are reading here" line, below the sticky chrome. */
  let band = 0;
  let currentId = '';

  function measure(): void {
    const scrollY = window.scrollY;
    tops = headings.map((h) => h.getBoundingClientRect().top + scrollY);
    // The band IS the anchor landing line: `scroll-margin-top` is the CSS
    // that parks a jumped-to heading clear of the header (plus the mini-ToC
    // bar below 1024px), so reading it keeps the spy and in-page jumps in
    // exact agreement at every breakpoint, from one source of truth.
    const first = headings[0];
    band = first ? parseFloat(getComputedStyle(first).scrollMarginTop) || 0 : 0;
  }

  function highlight(): void {
    // +1px of slack: a heading jumped to lands EXACTLY on the band, and
    // fractional scroll positions must not leave it one pixel short.
    const line = window.scrollY + band + 1;
    let id = ids[0];
    for (let i = 0; i < tops.length; i += 1) {
      if (tops[i] <= line) id = ids[i];
      else break;
    }
    if (id === currentId) return;

    const previous = linksById.get(currentId);
    if (previous) {
      for (const link of previous) link.removeAttribute('aria-current');
    }
    const next = linksById.get(id);
    if (next) {
      for (const link of next) link.setAttribute('aria-current', 'location');
      if (currentLabel) {
        currentLabel.textContent = (next[0]?.textContent ?? '').trim();
      }
    }
    currentId = id;
  }

  let queued = false;
  function onScroll(): void {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      highlight();
    });
  }

  measure();
  highlight();
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', () => {
    measure();
    highlight();
  });
  // Offsets also move when the page GROWS — a visualizer hydrating from its
  // static frame is the common case — which no resize event reports.
  if ('ResizeObserver' in window) {
    new ResizeObserver(() => {
      measure();
      highlight();
    }).observe(document.body);
  }
}

// Collapse the mobile mini-ToC once a section is chosen: the open panel is
// pinned over the article, so leaving it up would cover the target. Purely an
// enhancement — with JS off the panel stays open and a tap on the bar closes
// it, which is native <details> behaviour.
const inlineToc =
  document.querySelector<HTMLDetailsElement>('[data-toc-inline]');
inlineToc?.addEventListener('click', (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest('[data-toc-link]')) {
    inlineToc.open = false;
  }
});

// Escape dismisses the open panel and hands focus back to the bar that opened
// it — the expectation any overlaying panel sets, and the only way out for a
// keyboard user that doesn't mean tabbing through every section link.
inlineToc?.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || !inlineToc.open) return;
  inlineToc.open = false;
  inlineToc.querySelector('summary')?.focus();
});

// A module, not a global script: its top-level names stay its own.
export {};

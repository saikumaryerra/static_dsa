/**
 * Local progress — the ONE module that reads and clears the site's completion
 * state (site spec §6 client persistence; M7.2 "close the loops").
 *
 * WHY ONE MODULE: three surfaces now answer questions about the same keys — the
 * `/learn` resume CTA, its per-track counters and reset control, and the home
 * hero's continue line — and M8.1 layers mastery on top of exactly these keys by
 * extending this file rather than opening a second store. Keeping the key
 * format, the `try/catch` discipline, the delete list and the rule for WHEN a
 * surface re-reads storage (`onRestore`) in one place is what stops the three
 * from drifting apart.
 *
 * WHAT IT NEVER DOES:
 * - **Enumerate `localStorage` by key prefix.** Every function takes the lesson
 *   list injected from the build (`LessonRef[]`), so a renamed or unpublished
 *   lesson can never leave a stale key behind that inflates a count.
 * - **Write completion.** `MarkComplete.astro` owns the write path; this module
 *   reads and deletes, so there is exactly one writer of `lesson:{slug}:complete`.
 * - **Infer anything.** Only explicit user acts are stored (spec §6: no
 *   behavioral tracking — nothing here observes scroll depth or time on page).
 *
 * Every function is storage-safe: a browser that has no `localStorage` (the
 * build's Node pass, private modes that remove it) or that throws on access
 * (Safari's blocked-methods mode) degrades to "nothing is complete" instead of
 * throwing, so the caller's server-rendered fallback simply stays on screen.
 */

/** A lesson's identity as injected from the build (never read back out of storage). */
export interface LessonRef {
  /** URL segment and storage-key component, e.g. `binary-search`. */
  slug: string;
  /** Lesson title as shown to the reader. */
  title: string;
  /** Global order across both tracks (§7 frontmatter `order`). */
  order: number;
  /** Track id, e.g. `foundations` — the subset key for per-track counts. */
  track: string;
}

/**
 * Completion key for one lesson (spec §6 progress keys). Never widened to a
 * prefix scan.
 *
 * Exported because `MarkComplete.astro` is the one WRITER: it used to re-type
 * this template literal, which made the format a convention held in two places
 * rather than one rule, and a rename here would have left the read and write
 * paths pointing at different keys with nothing failing.
 *
 * @param slug - Lesson slug, e.g. `binary-search`.
 * @returns The `localStorage` key holding that lesson's completion mark.
 */
export function completeKey(slug: string): string {
  return `lesson:${slug}:complete`;
}

/**
 * The `localStorage` object, or `null` when it is unavailable.
 *
 * Two failure shapes, both non-errors here: the global is absent (Node during
 * the build, some privacy modes) — hence the `typeof` probe, which never throws
 * — and the property getter itself throws (blocked storage), hence the catch.
 */
function getStore(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * Reads completion for the given lessons.
 *
 * @param lessons - The build-injected lesson list to check (order preserved).
 * @returns The slugs marked complete, in the order they were passed in; `[]`
 * when storage is unavailable or a read throws.
 */
export function readCompleted(lessons: LessonRef[]): string[] {
  const store = getStore();
  if (!store) return [];
  const completed: string[] = [];
  try {
    for (const lesson of lessons) {
      if (store.getItem(completeKey(lesson.slug)) === '1') {
        completed.push(lesson.slug);
      }
    }
  } catch {
    // Blocked-methods mode throws per call. A partial list would silently
    // under-report every counter that derives from it, so report nothing rather
    // than something wrong — callers show their "unknown" state instead.
    return [];
  }
  return completed;
}

/**
 * True if that slug is marked complete.
 *
 * @param slug - Lesson slug.
 * @returns Whether `lesson:{slug}:complete` is set; `false` when storage fails.
 */
export function isComplete(slug: string): boolean {
  const store = getStore();
  if (!store) return false;
  try {
    return store.getItem(completeKey(slug)) === '1';
  } catch {
    return false;
  }
}

/**
 * First lesson in **global** order that is not complete — the resume target.
 *
 * Global, not per-track: the curriculum is one sequence and prev/next follows it
 * too (M7.1 IA-5), so "continue" must never dead-end at a track boundary.
 *
 * @param lessons - The build-injected lesson list (any order).
 * @returns The lesson to resume at, or `null` when every one is complete (or the
 * list is empty). With storage unavailable this is the first lesson — the same
 * answer the server-rendered fallback already shows.
 */
export function nextIncomplete(lessons: LessonRef[]): LessonRef | null {
  const done = new Set(readCompleted(lessons));
  // Sort a COPY: the array the caller passed is usually its render order too.
  const inOrder = [...lessons].sort((a, b) => a.order - b.order);
  return inOrder.find((lesson) => !done.has(lesson.slug)) ?? null;
}

/**
 * `{ done, total }` for a subset (one track) or for everything.
 *
 * @param lessons - The lessons to count; pass a filtered list for one track.
 * @returns Completed and total counts; `done` is 0 when storage is unavailable.
 */
export function countComplete(lessons: LessonRef[]): {
  done: number;
  total: number;
} {
  return { done: readCompleted(lessons).length, total: lessons.length };
}

/**
 * Clears every PROGRESS key for the given lessons — the delete half of the
 * progress system, shipped with the read half so the data is never one-way.
 *
 * Preference keys (`theme`, `pref:viz-speed`, `pref:code-lang`) are deliberately
 * NOT cleared (spec §6): resetting progress must not also throw away the
 * reader's theme or speed. When M8 lands, its progress keys — `progress:v1:{slug}`,
 * `ld:challenges:v1`, `ld:finalrun:v1`, `ld:days:v1` — join this clear list here,
 * which is the whole reason the reset control routes through this module.
 *
 * @param lessons - The build-injected lesson list; only these slugs are touched.
 * @returns How many keys were actually removed (0 when storage is unavailable),
 * so the caller can report the exact outcome.
 */
export function resetProgress(lessons: LessonRef[]): number {
  const store = getStore();
  if (!store) return 0;
  let removed = 0;
  for (const lesson of lessons) {
    // Per-key guard, unlike readCompleted: a delete that stops halfway would
    // leave the reader with a partly-cleared device and no way to finish, so one
    // blocked key must not strand the rest.
    try {
      const key = completeKey(lesson.slug);
      if (store.getItem(key) === null) continue;
      store.removeItem(key);
      removed += 1;
    } catch {
      // Keep going; the return value reports only what really went away.
    }
  }
  return removed;
}

/**
 * Parses the build-injected lesson list out of a `data-lessons` attribute.
 *
 * Pure and defensive on purpose: the JSON crosses a DOM boundary, so a truncated
 * or hand-edited attribute must degrade to "no list" (every caller then leaves
 * its server-rendered fallback alone) instead of throwing inside an island.
 *
 * @param json - Raw attribute value, e.g. `element.dataset.lessons`.
 * @returns The well-formed entries only; `[]` for missing or malformed input.
 */
export function parseLessonRefs(json: string | undefined | null): LessonRef[] {
  if (!json) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isLessonRef);
}

/** Shape guard for one injected entry — all four fields, right types. */
function isLessonRef(value: unknown): value is LessonRef {
  if (typeof value !== 'object' || value === null) return false;
  const ref = value as Partial<LessonRef>;
  return (
    typeof ref.slug === 'string' &&
    typeof ref.title === 'string' &&
    typeof ref.order === 'number' &&
    typeof ref.track === 'string'
  );
}

/**
 * The one place the resume CTA's wording lives, so the server-rendered fallback
 * and the hydrated rewrite cannot drift (the `/learn` and home pages both call
 * this at build time for the fallback and again at runtime).
 *
 * Three states, and the "start" wording is deliberate: a reader with nothing
 * stored is not "continuing" anything.
 *
 * @param next - The lesson to resume at, or `null` when all are complete.
 * @param completed - How many lessons are complete on this device.
 * @param total - How many lessons exist (callers render nothing when this is 0).
 * @returns The CTA's visible text — link text for the first two states, a plain
 * sentence for the third (which has no honest destination to link to).
 */
export function resumeLabel(
  next: LessonRef | null,
  completed: number,
  total: number,
): string {
  if (!next) return `All ${total} done — revisit any lesson.`;
  const number = String(next.order).padStart(2, '0');
  return completed === 0
    ? `Start with ${number} · ${next.title}`
    : `Continue: ${number} · ${next.title}`;
}

/**
 * Re-runs a progress surface's own render after a back/forward-cache restore.
 *
 * Every surface paints from storage once, when its island executes. A bfcache
 * restore — Back out of a lesson you just marked done — replays neither that
 * execution nor any load event, so the reader meets the DOM exactly as they left
 * it: stale counters, a resume CTA pointing at a finished lesson, a missing
 * checkmark. `pageshow` is the one event that does fire on that path, and
 * `persisted` is what separates it from an ordinary first paint (where the
 * caller has already rendered inline).
 *
 * Shared here for the same reason the key format is: three islands, one rule
 * about when progress is re-read.
 *
 * @param refresh - The caller's own render function; invoked with no arguments.
 */
export function onRestore(refresh: () => void): void {
  // The build's Node pass imports this module for `resumeLabel`; it must not
  // reach for a global that only exists in the browser.
  if (typeof window === 'undefined') return;
  window.addEventListener('pageshow', (event) => {
    if (event.persisted) refresh();
  });
}

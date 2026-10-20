/**
 * The site's one Shiki highlighter (React migration, D-07): markdown fences in
 * the MDX pipeline (`src/mdx/rehype-shiki-astro.ts`) and `<CodeTabs>` panels
 * both highlight through it, so the two can never drift onto different themes,
 * engines or token output.
 *
 * VENDORED. `highlight()` below is `createShikiHighlighterInternal`'s inner
 * `highlight` from `@astrojs/internal-helpers@0.10.1` (`dist/shiki.js`),
 * Copyright (c) 2021 Fred K. Schott, MIT License — copied rather than rewritten
 * because the legacy build's markup is the parity baseline (`proseHash` for all
 * 127 lessons), and every line of it is visible in that markup: the `shiki` →
 * `astro-code` class swap (kept until P5, decision D-12), `data-language`
 * keeping a SPECIAL language as authored (`text` stays `text`, never
 * `plaintext`), and the `; overflow-x: auto;` appended to the `<pre>` style.
 * Only `console.warn` on an unknown language is dropped (spec §18 bans console
 * output); the fallback to `plaintext` it announced is kept.
 *
 * Build-time only: nothing imports this from client code, so Shiki and its
 * grammars never reach the browser.
 */
import {
  createHighlighter,
  isSpecialLang,
  type HighlighterGeneric,
  type ShikiTransformer,
} from 'shiki';
import { createOnigurumaEngine } from 'shiki/engine/oniguruma';

/**
 * Dual-theme Shiki (spec §12/§13 AA): CSS-variable tokens so code blocks follow
 * the site light/dark theme. Both comment colors clear WCAG 1.4.3 (>= 4.5:1):
 * github-light comment #6a737d on #fff = 4.82:1; github-dark-default comment
 * #8b949e on #0d1117 = 6.15:1. Keep these two names in sync with the dark
 * wiring in `global.css`.
 */
export const SHIKI_THEMES = {
  light: 'github-light',
  dark: 'github-dark-default',
} as const;

/**
 * Languages loaded before the first render: the three `<CodeTabs>` languages
 * plus every fence language the lessons use. `text` is a Shiki special language
 * and needs no grammar; it is listed so the set reads as the inventory does.
 * Any other language is loaded on demand by `highlightToHast`.
 */
export const PRELOADED_LANGUAGES = [
  'python',
  'javascript',
  'java',
  'bash',
  'http',
  'json',
  'sql',
  'text',
  'yaml',
] as const;

/** Options the vendored transform reads (Astro's names). */
export interface HighlightOptions {
  /** `false` | `'light'` | `'dark'`: which theme's colours are inline. */
  defaultColor?: 'light' | 'dark' | false;
  /** `undefined`/`false` → `overflow-x: auto`; `true` → also pre-wrap. */
  wrap?: boolean | null;
  /** Render a `<code>` instead of a `<pre>`. */
  inline?: boolean;
  /** Fence meta string. */
  meta?: string;
  /** Extra attributes on the root (`class` and `style` are appended). */
  attributes?: Record<string, string>;
  /** Extra transformers, after the vendored one. */
  transformers?: ShikiTransformer[];
}

type Highlighter = HighlighterGeneric<string, string>;

/** Hast root, typed as loosely as the consumers need it. */
export type HighlightedHast = { type: 'root'; children: unknown[] };

let pending: Promise<Highlighter> | null = null;
let ready: Highlighter | null = null;

/**
 * Create (once) and return the highlighter, with the oniguruma WASM engine —
 * the engine Astro's `loadShikiEngine` used, so token boundaries match.
 *
 * @returns The shared highlighter.
 */
export function initHighlighter(): Promise<Highlighter> {
  pending ??= createHighlighter({
    langs: [
      'plaintext',
      ...PRELOADED_LANGUAGES.filter((lang) => !isSpecialLang(lang)),
    ],
    themes: Object.values(SHIKI_THEMES),
    engine: createOnigurumaEngine(import('shiki/wasm')),
  }).then((highlighter) => {
    ready = highlighter as Highlighter;
    return ready;
  });
  return pending;
}

/**
 * The highlighter, after `initHighlighter()` has resolved.
 *
 * @returns The shared highlighter.
 * @throws When called before initialization.
 */
function readyHighlighter(): Highlighter {
  if (!ready) {
    throw new Error(
      'highlight: the Shiki highlighter is not initialized. Await initHighlighter() (entry-server init()) before rendering.',
    );
  }
  return ready;
}

/**
 * Joins a hast class/style property the way Astro's `normalizePropAsString` did.
 *
 * @param value - A property value.
 * @returns The string form.
 */
function normalizePropAsString(value: unknown): string | undefined {
  if (Array.isArray(value)) return value.join(' ');
  return value === undefined || value === null ? undefined : String(value);
}

/**
 * The vendored transform: Astro's `highlight(code, lang, options, to)`, minus
 * the language loading (see `highlightToHast`), synchronous over a ready
 * highlighter.
 *
 * @param highlighter - A ready highlighter.
 * @param source - Code to highlight.
 * @param authoredLang - The language as authored.
 * @param options - Astro's options.
 * @param to - `hast` or `html`.
 * @returns Hast or an HTML string.
 */
function highlight(
  highlighter: Highlighter,
  source: string,
  authoredLang: string,
  options: HighlightOptions,
  to: 'hast' | 'html',
): HighlightedHast | string {
  let lang = authoredLang;
  const resolvedLang = lang;
  if (
    !isSpecialLang(lang) &&
    !highlighter.getLoadedLanguages().includes(resolvedLang)
  ) {
    lang = 'plaintext';
  }
  const code = source.replace(/(?:\r\n|\r|\n)$/, '');
  const inline = options.inline ?? false;
  const transformers: ShikiTransformer[] = [
    {
      pre(node) {
        if (inline) {
          node.tagName = 'code';
        }
        const {
          class: attributesClass,
          style: attributesStyle,
          ...rest
        } = options.attributes ?? {};
        Object.assign(node.properties, rest);
        const classValue =
          (normalizePropAsString(node.properties.class) ?? '') +
          (attributesClass ? ` ${attributesClass}` : '');
        const styleValue =
          (normalizePropAsString(node.properties.style) ?? '') +
          (attributesStyle ? `; ${attributesStyle}` : '');
        node.properties.class = classValue.replace(/shiki/g, 'astro-code');
        node.properties.dataLanguage = lang;
        if (options.wrap === false || options.wrap === undefined) {
          node.properties.style = styleValue + '; overflow-x: auto;';
        } else if (options.wrap === true) {
          node.properties.style =
            styleValue +
            '; overflow-x: auto; white-space: pre-wrap; word-wrap: break-word;';
        }
      },
      line(node) {
        if (resolvedLang === 'diff') {
          const innerSpanNode = node.children[0];
          const innerSpanTextNode =
            innerSpanNode?.type === 'element' && innerSpanNode.children?.[0];
          if (innerSpanTextNode && innerSpanTextNode.type === 'text') {
            const start = innerSpanTextNode.value[0];
            if (start === '+' || start === '-') {
              innerSpanTextNode.value = innerSpanTextNode.value.slice(1);
              innerSpanNode.children.unshift({
                type: 'element',
                tagName: 'span',
                properties: { style: 'user-select: none;' },
                children: [{ type: 'text', value: start }],
              });
            }
          }
        }
      },
      code(node) {
        if (inline) {
          return node.children[0] as typeof node;
        }
      },
    },
    ...(options.transformers ?? []),
  ];
  const shared = {
    themes: SHIKI_THEMES,
    defaultColor: options.defaultColor,
    lang,
    meta: options.meta ? { __raw: options.meta } : undefined,
    transformers,
    // No per-line time limit. Shiki's default (500 ms) abandons a line that is
    // slow to tokenize and paints the rest of the block in the default colour,
    // so on a loaded build machine the SAME source produced different HTML from
    // run to run — measured on `/learn/arrays/`'s JavaScript tab, where the
    // light pass gave up mid-block and every later token came out `#24292E`. A
    // build must be deterministic, and build-time highlighting has no reader
    // waiting on it, so the limit buys nothing here.
    tokenizeTimeLimit: 0,
  };
  return to === 'html'
    ? highlighter.codeToHtml(code, shared)
    : (highlighter.codeToHast(code, shared) as HighlightedHast);
}

/**
 * Highlight to hast, loading an unknown language on demand and falling back to
 * `plaintext` when Shiki has no such grammar (Astro's behaviour, minus its
 * console warning). Used by the MDX fence pass.
 *
 * @param code - Code to highlight.
 * @param lang - The fence language as authored (`plaintext` when none).
 * @param options - Astro's options.
 * @returns Hast whose single child is the `<pre>`.
 */
export async function highlightToHast(
  code: string,
  lang: string,
  options: HighlightOptions = {},
): Promise<HighlightedHast> {
  const highlighter = await initHighlighter();
  if (
    !isSpecialLang(lang) &&
    !highlighter.getLoadedLanguages().includes(lang)
  ) {
    try {
      // `loadLanguage` is typed to bundled ids; an authored fence is any string,
      // and an unknown one is exactly the case the catch exists for.
      await highlighter.loadLanguage(
        lang as Parameters<Highlighter['loadLanguage']>[0],
      );
    } catch {
      // Unknown language: `highlight` falls back to `plaintext`.
    }
  }
  return highlight(highlighter, code, lang, options, 'hast') as HighlightedHast;
}

/**
 * Highlight to an HTML string, synchronously, as Astro's `<Code>` component did
 * (`defaultColor: 'light'`, `wrap: false` are `<Code>`'s defaults; pass them).
 * Only languages already loaded are highlighted; anything else renders as
 * `plaintext`.
 *
 * @param code - Code to highlight.
 * @param lang - Language id.
 * @param options - Astro's options.
 * @returns The `<pre>` HTML.
 */
export function highlightToHtml(
  code: string,
  lang: string,
  options: HighlightOptions = {},
): string {
  return highlight(readyHighlighter(), code, lang, options, 'html') as string;
}

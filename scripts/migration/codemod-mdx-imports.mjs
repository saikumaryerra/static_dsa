/**
 * codemod-mdx-imports.mjs — the React migration's cutover codemod (plan §5 P5
 * step 1, decision D-08).
 *
 * During P1–P4 the 127 lessons kept importing `../../components/X.astro`, and a
 * temporary Vite resolver mapped each import to the sibling `X.tsx`. This
 * rewrites exactly those import lines to the extensionless specifier the React
 * build resolves natively, so the resolver can be deleted:
 *
 *   import Callout from '../../components/Callout.astro';
 *   → import Callout from '../../components/Callout';
 *
 * DETERMINISTIC AND NARROW. Only a whole line of the form
 * `import X from '<dir>/X.astro';` — the binding name equal to the file's base
 * name — is rewritten; nothing else in a lesson is touched, so the prose diff is
 * provably empty (`git diff -U0 -- src/content/lessons | grep '^[-+][^-+]' |
 * grep -v '^[-+]import '` prints nothing). Files are visited in sorted order and
 * every change is printed as `file:line old → new`. IDEMPOTENT: a second run
 * finds no `.astro` import and changes nothing.
 *
 *   node scripts/migration/codemod-mdx-imports.mjs
 */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

/* global URL -- Node has had a global WHATWG URL since 10. */

const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const LESSONS = path.join(ROOT, 'src/content/lessons');

/** A rewritable import line: the binding name repeats as the file's base name. */
const IMPORT = /^import (\w+) from '([^']*\/)\1\.astro';$/;

let files = 0;
let lines = 0;
for (const name of readdirSync(LESSONS)
  .filter((file) => file.endsWith('.mdx'))
  .sort()) {
  const file = path.join(LESSONS, name);
  const source = readFileSync(file, 'utf8');
  const out = source.split('\n').map((line, index) => {
    const match = IMPORT.exec(line);
    if (!match) return line;
    const next = `import ${match[1]} from '${match[2]}${match[1]}';`;
    process.stdout.write(
      `${path.relative(ROOT, file)}:${index + 1} ${line} → ${next}\n`,
    );
    lines += 1;
    return next;
  });
  const result = out.join('\n');
  if (result !== source) {
    writeFileSync(file, result);
    files += 1;
  }
}
process.stdout.write(
  `codemod-mdx-imports: ${lines} import line(s) rewritten in ${files} file(s)\n`,
);

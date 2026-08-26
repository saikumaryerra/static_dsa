/**
 * CLI for the content validator — `npm run validate:content`.
 *
 * The rules live in `scripts/lib/content-validator.mjs` so the same pass runs
 * from two places: here, and `tests/unit/content-validator.test.ts`, which is
 * what makes it part of `npm run test` and therefore of the DoD gate (spec §18,
 * SPEC Appendix D item 10).
 *
 * Exits non-zero on any error. Warnings and notes are printed and do not fail;
 * a note is an overage or omission somebody reviewed, printed so it stays seen.
 */
import process from 'node:process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateContent } from './lib/content-validator.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/**
 * `--strict` turns a PENDING coverage topic into an error. CI runs it; the
 * authoring pass does not, so a commit that lands one module does not fail on
 * the modules still to come.
 */
const strict = process.argv.includes('--strict');
const { errors, warnings, notes, pending, checked } = validateContent(root, {
  strict,
});

/**
 * Writes a line to stdout. `console` is banned repo-wide by ESLint (spec §18),
 * which is why every script here uses the stream directly.
 *
 * @param {string} line - The line to write.
 * @returns {void}
 */
const say = (line) => void process.stdout.write(`${line}\n`);

// Notes first, and always: they are decisions somebody reviewed, and printing
// them on every run is what keeps them decisions rather than a silent exemption.
for (const note of notes) say(`note  ${note}`);
for (const warning of warnings) say(`warn  ${warning}`);
for (const error of errors) say(`ERROR ${error}`);

if (errors.length > 0) {
  say(
    `\ncontent validator — ${errors.length} error(s) across ${checked} published lesson(s)`,
  );
  process.exit(1);
}
say(
  `content validator${strict ? ' (strict)' : ''} — ${checked} published lesson(s) clean` +
    (warnings.length > 0 ? `, ${warnings.length} warning(s)` : '') +
    (notes.length > 0 ? `, ${notes.length} accepted note(s)` : '') +
    (!strict && pending.length > 0
      ? `, ${pending.length} coverage topic(s) pending`
      : ''),
);

import { describe, expect, it } from 'vitest';
import { readingTimeMinutes } from '../../src/lib/reading-time';

describe('readingTimeMinutes', () => {
  it('rounds word count to minutes at 200 wpm', () => {
    const fourHundredWords = Array.from({ length: 400 }, () => 'word').join(
      ' ',
    );
    expect(readingTimeMinutes(fourHundredWords)).toBe(2);
  });

  it('rounds to the nearest minute', () => {
    const threeHundred = Array.from({ length: 300 }, () => 'word').join(' ');
    expect(readingTimeMinutes(threeHundred)).toBe(2); // 1.5 → 2
    const twoTwenty = Array.from({ length: 220 }, () => 'word').join(' ');
    expect(readingTimeMinutes(twoTwenty)).toBe(1); // 1.1 → 1
  });

  it('always returns at least 1 minute for non-empty prose', () => {
    expect(readingTimeMinutes('just a few words')).toBe(1);
  });

  it('returns 1 for empty input', () => {
    expect(readingTimeMinutes('')).toBe(1);
    expect(readingTimeMinutes('   ')).toBe(1);
  });

  it('excludes fenced and inline code from the count', () => {
    const prose = Array.from({ length: 200 }, () => 'word').join(' ');
    const code =
      '```js\n' +
      Array.from({ length: 1000 }, () => 'const x = 1;').join('\n') +
      '\n```';
    const inline =
      '`' + Array.from({ length: 500 }, () => 'ignore').join(' ') + '`';
    // Prose alone is 200 words → 1 min; the code must not inflate it.
    expect(readingTimeMinutes(`${prose}\n\n${code}\n\n${inline}`)).toBe(1);
  });
});

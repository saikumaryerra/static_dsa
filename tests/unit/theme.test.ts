import { describe, expect, it } from 'vitest';
import { resolveTheme, THEME_STORAGE_KEY } from '../../src/lib/theme';

describe('resolveTheme', () => {
  it('returns the stored theme when the user explicitly chose light', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('light', false)).toBe('light');
  });

  it('returns the stored theme when the user explicitly chose dark', () => {
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('dark', false)).toBe('dark');
  });

  it('falls back to the system preference when no theme is stored', () => {
    expect(resolveTheme(null, true)).toBe('dark');
    expect(resolveTheme(null, false)).toBe('light');
  });

  it('treats corrupt or legacy stored values as "no choice" and uses the system preference', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('DARK', false)).toBe('light');
    expect(resolveTheme('', true)).toBe('dark');
  });

  it('uses the localStorage key mandated by the designer spec', () => {
    expect(THEME_STORAGE_KEY).toBe('theme');
  });
});

import { Injectable, inject, signal } from '@angular/core';
import { PrimeNG } from 'primeng/config';

import { presetFor, THEMES, ThemeName } from './theme-presets';

const LS_KEY = 'wpr_theme';
const DEFAULT_THEME: ThemeName = 'navy';

/**
 * Applies a legacy-parity theme at runtime.
 *
 *  - PrimeNG primary colour scale swap (buttons, focus rings, chips).
 *  - `data-theme` attribute on <html> — CSS variables in styles.scss
 *    pick up the shell header + page background colours from there.
 *  - Persisted to localStorage so the choice survives reload.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly primeng = inject(PrimeNG);

  private readonly _current = signal<ThemeName>(DEFAULT_THEME);
  readonly current = this._current.asReadonly();

  readonly themes = THEMES;

  /** Applies the persisted theme (or default). Call once at bootstrap. */
  init(): void {
    const stored = this.readStored();
    this.apply(stored ?? DEFAULT_THEME);
  }

  apply(name: ThemeName): void {
    this._current.set(name);
    document.documentElement.setAttribute('data-theme', name);
    this.primeng.theme.set({
      preset: presetFor(name),
      options: {
        darkModeSelector: '.dark',
        cssLayer: {
          name: 'primeng',
          order: 'tailwind-base, primeng, tailwind-utilities',
        },
      },
    });
    try {
      localStorage.setItem(LS_KEY, name);
    } catch {
      // Ignore private-mode / disabled-storage errors — non-critical.
    }
  }

  private readStored(): ThemeName | null {
    try {
      const raw = localStorage.getItem(LS_KEY);
      const valid = THEMES.some((t) => t.name === raw);
      return valid ? (raw as ThemeName) : null;
    } catch {
      return null;
    }
  }
}

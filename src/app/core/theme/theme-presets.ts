import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

/**
 * Five theme variants ported from the legacy HTML. Each one swaps
 * PrimeNG's primary colour scale AND drives a set of CSS custom
 * properties (see `styles.scss`) that colour the app-shell header
 * and page background.
 */
export type ThemeName = 'navy' | 'arctic' | 'lavender' | 'mint' | 'rosegold';

export interface ThemeSpec {
  name: ThemeName;
  label: string;
  /** Sub-label shown in the tooltip. */
  desc: string;
  /** Preview colours for the dot picker — [shell dark, accent]. */
  swatches: [string, string];
}

export const THEMES: ThemeSpec[] = [
  { name: 'navy', label: 'Navy', desc: 'Default — RBH navy + orange', swatches: ['#0A1628', '#E8721A'] },
  { name: 'arctic', label: 'Arctic', desc: 'Clean blue + amber', swatches: ['#1E40AF', '#F59E0B'] },
  { name: 'lavender', label: 'Lavender', desc: 'Soft purple + gold', swatches: ['#4C1D95', '#F59E0B'] },
  { name: 'mint', label: 'Mint', desc: 'Sage green + orange', swatches: ['#064E3B', '#F97316'] },
  { name: 'rosegold', label: 'Rose Gold', desc: 'Rose + copper', swatches: ['#881337', '#EA580C'] },
];

interface PrimaryScale {
  50: string;
  100: string;
  200: string;
  300: string;
  400: string;
  500: string;
  600: string;
  700: string;
  800: string;
  900: string;
  950: string;
}

/**
 * Primary colour scale per theme. The 500 shade is the button /
 * focus-ring / active colour. Matches the legacy `--accent` variable.
 */
const PALETTES: Record<ThemeName, PrimaryScale> = {
  navy: {
    50: '#FEF3EA',
    100: '#FCE0C7',
    200: '#F9C08F',
    300: '#F5A057',
    400: '#F28020',
    500: '#E8721A',
    600: '#C7601A',
    700: '#A54E15',
    800: '#833C10',
    900: '#622A0B',
    950: '#3F1B07',
  },
  arctic: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
    950: '#451A03',
  },
  lavender: {
    50: '#FFFBEB',
    100: '#FEF3C7',
    200: '#FDE68A',
    300: '#FCD34D',
    400: '#FBBF24',
    500: '#F59E0B',
    600: '#D97706',
    700: '#B45309',
    800: '#92400E',
    900: '#78350F',
    950: '#451A03',
  },
  mint: {
    50: '#FFF7ED',
    100: '#FFEDD5',
    200: '#FED7AA',
    300: '#FDBA74',
    400: '#FB923C',
    500: '#F97316',
    600: '#EA580C',
    700: '#C2410C',
    800: '#9A3412',
    900: '#7C2D12',
    950: '#431407',
  },
  rosegold: {
    50: '#FFF7ED',
    100: '#FFEDD5',
    200: '#FED7AA',
    300: '#FDBA74',
    400: '#FB923C',
    500: '#EA580C',
    600: '#C2410C',
    700: '#9A3412',
    800: '#7C2D12',
    900: '#431407',
    950: '#2A0A03',
  },
};

/** Build a PrimeNG preset for the given theme. */
export function presetFor(name: ThemeName) {
  const primary = PALETTES[name];
  return definePreset(Aura, {
    semantic: {
      primary,
      colorScheme: {
        light: {
          primary: {
            color: '{primary.500}',
            contrastColor: '#ffffff',
            hoverColor: '{primary.600}',
            activeColor: '{primary.700}',
          },
          highlight: {
            background: '{primary.50}',
            focusBackground: '{primary.100}',
            color: '{primary.700}',
            focusColor: '{primary.800}',
          },
        },
        dark: {
          primary: {
            color: '{primary.400}',
            contrastColor: '{surface.900}',
            hoverColor: '{primary.300}',
            activeColor: '{primary.200}',
          },
        },
      },
    },
  });
}

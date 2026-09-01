import { definePreset } from '@primeng/themes';
import Aura from '@primeng/themes/aura';

/**
 * RBH-branded PrimeNG preset.
 *
 * Aura's default primary is emerald — we swap it for the RBH accent
 * (#E8721A, an amber-orange) so buttons, focus rings, and highlighted
 * links match the company palette. Everything else (spacing, radius,
 * elevations) stays on Aura's defaults.
 */
export const RbhPreset = definePreset(Aura, {
  semantic: {
    primary: {
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

import type { ApexChart, ApexTooltip, ApexLegend, ApexStates, ApexTheme } from 'ng-apexcharts';

/**
 * Shared ApexCharts base config — every dashboard chart pulls its
 * animation, tooltip, font, and hover styling from here so a theme
 * change is a one-line edit instead of a six-file sweep.
 */
export const CHART_FONT = 'Inter, ui-sans-serif, system-ui, -apple-system, sans-serif';

export const chartBase: Partial<ApexChart> = {
  fontFamily: CHART_FONT,
  toolbar: { show: false },
  animations: {
    enabled: true,
    speed: 350,
    animateGradually: { enabled: false, delay: 0 },
    dynamicAnimation: { enabled: true, speed: 250 },
  },
  background: 'transparent',
  foreColor: '#475569',
};

export const chartTooltip: ApexTooltip = {
  theme: 'light',
  style: { fontFamily: CHART_FONT, fontSize: '12px' },
  marker: { show: true },
};

export const chartLegend: ApexLegend = {
  position: 'bottom',
  horizontalAlign: 'center',
  fontFamily: CHART_FONT,
  fontSize: '12px',
  markers: { size: 5, strokeWidth: 0 },
  itemMargin: { horizontal: 8, vertical: 4 },
  labels: { colors: '#334155' },
};

export const chartStates: ApexStates = {
  hover: { filter: { type: 'lighten' } },
  active: { filter: { type: 'darken' } },
};

export const chartTheme: ApexTheme = { mode: 'light' };

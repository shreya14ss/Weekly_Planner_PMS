import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { NgApexchartsModule, type ApexOptions } from 'ng-apexcharts';

import { StatusSegment } from '@features/dashboard/dashboard-aggregations';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import {
  CHART_FONT,
  chartBase,
  chartLegend,
  chartStates,
  chartTheme,
  chartTooltip,
} from '@shared/utils/chart-theme';

/**
 * Status Distribution donut, ApexCharts. Options are recomputed
 * whenever the input segments change; a total number sits in the
 * middle of the donut via `dataLabels.total`.
 */
@Component({
  selector: 'app-status-donut',
  standalone: true,
  imports: [NgApexchartsModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() === 0) {
      <app-empty-state variant="chart" subtitle="No projects in the current scope." />
    } @else {
      <apx-chart
        [series]="options().series!"
        [chart]="options().chart!"
        [labels]="options().labels!"
        [colors]="options().colors!"
        [plotOptions]="options().plotOptions!"
        [stroke]="options().stroke!"
        [dataLabels]="options().dataLabels!"
        [legend]="options().legend!"
        [tooltip]="options().tooltip!"
        [states]="options().states!"
        [theme]="options().theme!"
      />
    }
  `,
  styleUrl: './status-donut.component.scss',
})
export class StatusDonutComponent {
  readonly segments = input.required<StatusSegment[]>();

  protected readonly total = computed(() =>
    this.segments().reduce((acc, s) => acc + s.count, 0),
  );

  protected readonly options = computed<ApexOptions>(() => {
    const segs = this.segments();
    return {
      series: segs.map((s) => s.count),
      chart: {
        ...chartBase,
        type: 'donut',
        height: 250,
      },
      labels: segs.map((s) => s.status || 'Not Set'),
      colors: segs.map((s) => s.color),
      stroke: { width: 2, colors: ['#ffffff'] },
      plotOptions: {
        pie: {
          donut: {
            size: '68%',
            labels: {
              show: true,
              name: {
                fontFamily: CHART_FONT,
                fontSize: '11px',
                fontWeight: 700,
                color: '#64748b',
                offsetY: 20,
              },
              value: {
                fontFamily: CHART_FONT,
                fontSize: '28px',
                fontWeight: 800,
                color: '#0f172a',
                offsetY: -18,
                formatter: (v) => String(v),
              },
              total: {
                show: true,
                label: 'PROJECTS',
                fontFamily: CHART_FONT,
                fontSize: '11px',
                fontWeight: 700,
                color: '#64748b',
                formatter: () => String(this.total()),
              },
            },
          },
        },
      },
      dataLabels: { enabled: false },
      legend: { ...chartLegend, position: 'bottom' },
      tooltip: {
        ...chartTooltip,
        y: {
          formatter: (val: number) => {
            const total = this.total() || 1;
            const pct = Math.round((val / total) * 100);
            return `${val} (${pct}%)`;
          },
        },
      },
      states: chartStates,
      theme: chartTheme,
    };
  });
}

import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { NgApexchartsModule, type ApexOptions } from 'ng-apexcharts';

import { ClientBar } from '@features/dashboard/dashboard-aggregations';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import {
  chartBase,
  chartLegend,
  chartStates,
  chartTheme,
  chartTooltip,
} from '@shared/utils/chart-theme';

/**
 * Horizontal stacked bar per client — Active / Completed / On Hold / Other.
 * Rendered by ApexCharts so we get built-in tooltips and legend hover
 * highlighting without hand-rolling the segment math.
 */
@Component({
  selector: 'app-client-bars',
  standalone: true,
  imports: [NgApexchartsModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (bars().length === 0) {
      <app-empty-state variant="chart" subtitle="No client breakdown available." />
    } @else {
      <apx-chart
        [series]="options().series!"
        [chart]="options().chart!"
        [colors]="options().colors!"
        [plotOptions]="options().plotOptions!"
        [dataLabels]="options().dataLabels!"
        [xaxis]="options().xaxis!"
        [yaxis]="options().yaxis!"
        [grid]="options().grid!"
        [legend]="options().legend!"
        [tooltip]="options().tooltip!"
        [states]="options().states!"
        [theme]="options().theme!"
      />
    }
  `,
  styleUrl: './client-bars.component.scss',
})
export class ClientBarsComponent {
  readonly bars = input.required<ClientBar[]>();

  protected readonly options = computed<ApexOptions>(() => {
    const rows = this.bars();
    // Rough sizing: 44px per client row plus header/footer chrome.
    const height = Math.max(160, rows.length * 44 + 90);

    return {
      series: [
        { name: 'Active', data: rows.map((r) => r.active) },
        { name: 'Completed', data: rows.map((r) => r.done) },
        { name: 'On Hold', data: rows.map((r) => r.hold) },
        { name: 'Other', data: rows.map((r) => r.other) },
      ],
      chart: {
        ...chartBase,
        type: 'bar',
        stacked: true,
        stackType: 'normal',
        height,
      },
      colors: ['#2563EB', '#059669', '#D97706', '#9CA3AF'],
      plotOptions: {
        bar: {
          horizontal: true,
          borderRadius: 4,
          borderRadiusApplication: 'end',
          barHeight: '58%',
          dataLabels: { total: { enabled: true, style: { fontWeight: 700, color: '#0f172a' } } },
        },
      },
      dataLabels: {
        enabled: true,
        style: { fontSize: '11px', fontWeight: 700, colors: ['#ffffff'] },
        formatter: (v) => (Number(v) > 0 ? String(v) : ''),
      },
      xaxis: {
        categories: rows.map((r) => r.client),
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { fontSize: '11px' } },
      },
      yaxis: {
        labels: { style: { fontSize: '12px', fontWeight: 700 } },
      },
      grid: {
        borderColor: '#f1f5f9',
        strokeDashArray: 3,
        yaxis: { lines: { show: false } },
        padding: { left: 6, right: 12 },
      },
      legend: chartLegend,
      tooltip: chartTooltip,
      states: chartStates,
      theme: chartTheme,
    };
  });
}

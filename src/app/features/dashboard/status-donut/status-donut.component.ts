import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { NgApexchartsModule, type ApexOptions } from 'ng-apexcharts';

import { StatusSegment } from '@features/dashboard/dashboard-aggregations';
import { dashFilterForStatusLabel } from '@features/dashboard/status-utils';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import {
  CHART_FONT,
  chartBase,
  chartStates,
  chartTheme,
  chartTooltip,
} from '@shared/utils/chart-theme';

/**
 * Status distribution — compact donut on the left, data-rich clickable
 * legend on the right. Each legend row shows dot · label · count · %
 * and emits the raw status string on click so the parent can map it
 * to the dashboard status filter.
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
      <div class="wrap">
        <div class="donut">
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
        </div>

        <ul class="legend">
          @for (s of segments(); track s.status) {
            <li>
              <button
                type="button"
                class="lg-row"
                [attr.data-active]="isActiveRow(s.status) || null"
                (click)="filter.emit(s.status)"
              >
                <span class="dot" [style.background]="s.color"></span>
                <span class="lbl" [title]="s.status || 'Not Set'">
                  {{ s.status || 'Not Set' }}
                </span>
                <span class="dashes"></span>
                <span class="cnt">{{ s.count }}</span>
                <span class="pct">{{ pctOf(s.count) }}%</span>
              </button>
            </li>
          }
        </ul>
      </div>
    }
  `,
  styleUrl: './status-donut.component.scss',
})
export class StatusDonutComponent {
  readonly segments = input.required<StatusSegment[]>();
  /**
   * Currently-active dashboard filter key (e.g. 'hold', 'active').
   * A legend row highlights when its label maps to this same key —
   * so "In Progress" AND "Testing" both light up when the filter is
   * 'active', not just the first match.
   */
  readonly activeStatus = input<string>('');
  /** Emits the raw status label when a legend row is clicked. */
  readonly filter = output<string>();

  protected readonly total = computed(() =>
    this.segments().reduce((acc, s) => acc + s.count, 0),
  );

  protected pctOf(count: number): number {
    const t = this.total() || 1;
    return Math.round((count / t) * 100);
  }

  protected isActiveRow(label: string): boolean {
    const key = this.activeStatus();
    if (!key || key === 'all') return false;
    return dashFilterForStatusLabel(label) === key;
  }

  protected readonly options = computed<ApexOptions>(() => {
    const segs = this.segments();
    return {
      series: segs.map((s) => s.count),
      chart: {
        ...chartBase,
        type: 'donut',
        height: 180,
        sparkline: { enabled: true }, // strips padding so the donut sits tight
      },
      labels: segs.map((s) => s.status || 'Not Set'),
      colors: segs.map((s) => s.color),
      stroke: { width: 2, colors: ['#ffffff'] },
      plotOptions: {
        pie: {
          donut: {
            size: '72%',
            labels: {
              show: true,
              name: {
                fontFamily: CHART_FONT,
                fontSize: '10px',
                fontWeight: 700,
                color: '#94a3b8',
                offsetY: 16,
              },
              value: {
                fontFamily: CHART_FONT,
                fontSize: '22px',
                fontWeight: 800,
                color: '#0f172a',
                offsetY: -14,
                formatter: (v) => String(v),
              },
              total: {
                show: true,
                label: 'TOTAL',
                fontFamily: CHART_FONT,
                fontSize: '10px',
                fontWeight: 700,
                color: '#94a3b8',
                formatter: () => String(this.total()),
              },
            },
          },
        },
      },
      dataLabels: { enabled: false },
      legend: { show: false }, // our own legend to the right
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

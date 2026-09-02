import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';

import { NgApexchartsModule, type ApexOptions } from 'ng-apexcharts';

import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';
import { WeekRepository } from '@core/pouchdb/week.repository';
import { WeekStateService } from '@core/services/week-state.service';
import { IsoDate } from '@models/common';
import { addWeeks, formatWeekRange } from '@shared/utils/date.util';
import {
  chartBase,
  chartLegend,
  chartStates,
  chartTheme,
  chartTooltip,
} from '@shared/utils/chart-theme';

interface WeekBucket {
  weekStart: IsoDate;
  label: string;
  onTrack: number;
  atRisk: number;
  delayed: number;
  onHold: number;
  total: number;
}

const N_WEEKS = 6;

/**
 * Portfolio health trend over the last 6 weeks. Rendered as an
 * ApexCharts stacked column — On Track / At Risk / Delayed / On Hold
 * per week, with the currently loaded week highlighted via a distinct
 * label style.
 */
@Component({
  selector: 'app-weekly-trend-chart',
  standalone: true,
  imports: [NgApexchartsModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="hdr">
      <div>
        <h3 class="title">Weekly Tracker Trend</h3>
        <p class="sub">On Track / At Risk / Delayed / On Hold — last {{ nWeeks }} weeks</p>
      </div>
    </header>

    @if (loading()) {
      <div class="loading">
        <i class="pi pi-spinner pi-spin mr-2"></i>
        Loading trend…
      </div>
    } @else if (!hasData()) {
      <app-empty-state variant="trend" subtitle="The trend fills in as weeks are used." />
    } @else {
      <apx-chart
        [series]="options().series!"
        [chart]="options().chart!"
        [colors]="options().colors!"
        [plotOptions]="options().plotOptions!"
        [dataLabels]="options().dataLabels!"
        [annotations]="options().annotations!"
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
  styleUrl: './weekly-trend-chart.component.scss',
})
export class WeeklyTrendChartComponent {
  private readonly weekRepo = inject(WeekRepository);
  private readonly state = inject(WeekStateService);

  protected readonly nWeeks = N_WEEKS;

  private readonly buckets = signal<WeekBucket[]>([]);
  protected readonly loading = signal(true);

  protected readonly hasData = computed(() => this.buckets().some((b) => b.total > 0));

  protected readonly options = computed<ApexOptions>(() => {
    const buckets = this.buckets();
    const currentWeek = this.state.loadedWeek();
    const currentIdx = buckets.findIndex((b) => b.weekStart === currentWeek);

    return {
      series: [
        { name: 'On Track', data: buckets.map((b) => b.onTrack) },
        { name: 'At Risk', data: buckets.map((b) => b.atRisk) },
        { name: 'Delayed', data: buckets.map((b) => b.delayed) },
        { name: 'On Hold', data: buckets.map((b) => b.onHold) },
      ],
      chart: {
        ...chartBase,
        type: 'bar',
        stacked: true,
        stackType: 'normal',
        height: 260,
      },
      colors: ['#059669', '#D97706', '#DC2626', '#7C3AED'],
      plotOptions: {
        bar: {
          borderRadius: 6,
          borderRadiusApplication: 'end',
          borderRadiusWhenStacked: 'last',
          columnWidth: '52%',
          dataLabels: {
            total: {
              enabled: true,
              style: { fontWeight: 700, color: '#0f172a' },
              // Only show a total above bars that actually have data;
              // otherwise every empty week gets a redundant "0" label.
              formatter: (v: string) => (Number(v) > 0 ? v : ''),
            },
          },
        },
      },
      dataLabels: { enabled: false },
      annotations: currentIdx >= 0
        ? {
            xaxis: [
              {
                x: buckets[currentIdx].label,
                strokeDashArray: 0,
                borderColor: 'transparent',
                fillColor: '#dbeafe',
                opacity: 0.35,
              },
            ],
            points: [
              {
                // Anchor at the vertical midpoint of the current week's
                // column so the label reads *inside* the bar rather
                // than floating above it.
                x: buckets[currentIdx].label,
                y: buckets[currentIdx].total / 2,
                marker: { size: 0 },
                label: {
                  text: 'This week',
                  offsetY: 4,
                  borderColor: 'transparent',
                  borderWidth: 0,
                  style: {
                    color: '#ffffff',
                    background: 'transparent',
                    fontSize: '10.5px',
                    fontWeight: '700',
                    padding: { top: 0, bottom: 0, left: 0, right: 0 },
                  },
                },
              },
            ],
          }
        : undefined,
      xaxis: {
        categories: buckets.map((b) => b.label),
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: {
          style: {
            fontSize: '11px',
            colors: buckets.map((b) => (b.weekStart === currentWeek ? '#1a72cc' : '#64748b')),
            fontWeight: 700,
          },
        },
      },
      yaxis: {
        labels: {
          style: { fontSize: '11px' },
          formatter: (v: number) => (Number.isInteger(v) ? String(v) : ''),
        },
        forceNiceScale: true,
      },
      grid: {
        borderColor: '#f1f5f9',
        strokeDashArray: 3,
        padding: { left: 6, right: 6 },
      },
      legend: chartLegend,
      tooltip: chartTooltip,
      states: chartStates,
      theme: chartTheme,
    };
  });

  constructor() {
    effect(() => {
      const wk = this.state.loadedWeek();
      untracked(() => this.load(wk));
    });
  }

  private async load(anchor: IsoDate): Promise<void> {
    this.loading.set(true);
    try {
      const weeks: IsoDate[] = [];
      for (let i = N_WEEKS - 1; i >= 0; i--) weeks.push(addWeeks(anchor, -i));
      const docs = await Promise.all(weeks.map((w) => this.weekRepo.load(w)));

      const out: WeekBucket[] = weeks.map((weekStart, i) => {
        const doc = docs[i];
        const bucket: WeekBucket = {
          weekStart,
          label: this.shortLabel(weekStart),
          onTrack: 0,
          atRisk: 0,
          delayed: 0,
          onHold: 0,
          total: 0,
        };
        if (!doc) return bucket;
        for (const entry of Object.values(doc.entries)) {
          const cat = this.categorise(entry);
          if (cat === null) continue;
          bucket[cat]++;
          bucket.total++;
        }
        return bucket;
      });

      this.buckets.set(out);
    } finally {
      this.loading.set(false);
    }
  }

  /**
   * A project's health for the week, based on its task mix:
   *   - onHold if any hold and no completions
   *   - delayed if it has any delayed tasks
   *   - atRisk if it has in-progress work but no delays
   *   - onTrack if everything is done, or nearly so
   * Returns null if the entry has no tasks (nothing to categorise).
   */
  private categorise(
    entry: { weekTasks?: { status: string }[] } | undefined,
  ): 'onTrack' | 'atRisk' | 'delayed' | 'onHold' | null {
    const tasks = entry?.weekTasks ?? [];
    if (tasks.length === 0) return null;
    const total = tasks.length;
    let done = 0,
      inProg = 0,
      delay = 0,
      hold = 0;
    for (const t of tasks) {
      const s = t.status;
      if (s === 'completed') done++;
      else if (s === 'in-progress' || s === 'todo') inProg++;
      else if (s === 'delay') delay++;
      else if (s === 'hold') hold++;
    }
    if (delay > 0) return 'delayed';
    if (hold > 0 && done < total) return 'onHold';
    if (done === total) return 'onTrack';
    if (done + inProg >= Math.ceil(total * 0.6)) return 'onTrack';
    return 'atRisk';
  }

  private shortLabel(iso: IsoDate): string {
    return formatWeekRange(iso).split(' – ')[0];
  }
}

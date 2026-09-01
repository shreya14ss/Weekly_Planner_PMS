import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';

import { WeekRepository } from '@core/pouchdb/week.repository';
import { WeekStateService } from '@core/services/week-state.service';
import { IsoDate } from '@models/common';
import { addWeeks, formatWeekRange } from '@shared/utils/date.util';

interface WeekBucket {
  weekStart: IsoDate;
  label: string;
  onTrack: number;
  atRisk: number;
  delayed: number;
  onHold: number;
  total: number;
}

interface RenderedBar {
  bucket: WeekBucket;
  segments: { color: string; height: number; hint: string }[];
  total: number;
  isCurrent: boolean;
}

const CHART_H = 150; // px, matches SCSS
const N_WEEKS = 6;

/**
 * Portfolio health trend over the last 6 weeks.
 *
 * Each bar is a stack of On-Track / At-Risk / Delayed / On-Hold counts
 * derived from that week's stored entries. Loads asynchronously and
 * re-runs whenever the currently loaded week changes so the trend
 * always ends on the week the user is viewing.
 */
@Component({
  selector: 'app-weekly-trend-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="hdr">
      <div>
        <h3 class="title">Weekly Tracker Trend</h3>
        <p class="sub">On Track / At Risk / Delayed / On Hold — last {{ nWeeks }} weeks</p>
      </div>
      <div class="legend">
        <span class="l"><span class="dot dot-ok"></span>On Track</span>
        <span class="l"><span class="dot dot-risk"></span>At Risk</span>
        <span class="l"><span class="dot dot-late"></span>Delayed</span>
        <span class="l"><span class="dot dot-hold"></span>On Hold</span>
      </div>
    </header>

    @if (loading()) {
      <div class="loading">
        <i class="pi pi-spinner pi-spin mr-2"></i>
        Loading trend…
      </div>
    } @else if (!hasData()) {
      <div class="empty">
        <i class="pi pi-chart-bar text-3xl text-slate-300 block mb-2"></i>
        <div class="text-sm text-slate-500">
          No historical data yet. The trend fills in as weeks are used.
        </div>
      </div>
    } @else {
      <div class="chart" [style.height.px]="chartH">
        @for (bar of bars(); track bar.bucket.weekStart) {
          <div class="col">
            <div class="col-num">{{ bar.total || '' }}</div>
            <div class="stack">
              @for (seg of bar.segments; track $index) {
                <div
                  class="seg"
                  [style.height.px]="seg.height"
                  [style.background]="seg.color"
                  [title]="seg.hint"
                ></div>
              }
            </div>
            <div class="col-lbl" [class.current]="bar.isCurrent">
              {{ bar.bucket.label }}
              @if (bar.isCurrent) {
                <span class="cur-mark">•</span>
              }
            </div>
          </div>
        }
      </div>
    }
  `,
  styleUrl: './weekly-trend-chart.component.scss',
})
export class WeeklyTrendChartComponent {
  private readonly weekRepo = inject(WeekRepository);
  private readonly state = inject(WeekStateService);

  protected readonly nWeeks = N_WEEKS;
  protected readonly chartH = CHART_H;

  private readonly buckets = signal<WeekBucket[]>([]);
  protected readonly loading = signal(true);

  protected readonly hasData = computed(() => this.buckets().some((b) => b.total > 0));

  protected readonly bars = computed<RenderedBar[]>(() => {
    const buckets = this.buckets();
    const max = Math.max(1, ...buckets.map((b) => b.total));
    const currentWeek = this.state.loadedWeek();

    return buckets.map((b) => ({
      bucket: b,
      total: b.total,
      isCurrent: b.weekStart === currentWeek,
      segments: this.segmentsFor(b, max),
    }));
  });

  constructor() {
    effect(() => {
      const wk = this.state.loadedWeek();
      untracked(() => this.load(wk));
    });
  }

  private segmentsFor(b: WeekBucket, max: number): RenderedBar['segments'] {
    if (b.total === 0) return [];
    const scale = (n: number) => Math.round((n / max) * CHART_H);
    return [
      { color: '#059669', height: scale(b.onTrack), hint: `On Track: ${b.onTrack}` },
      { color: '#D97706', height: scale(b.atRisk), hint: `At Risk: ${b.atRisk}` },
      { color: '#DC2626', height: scale(b.delayed), hint: `Delayed: ${b.delayed}` },
      { color: '#7C3AED', height: scale(b.onHold), hint: `On Hold: ${b.onHold}` },
    ].filter((s) => s.height > 0);
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
    // "29 Jun" — start-of-week is the more recognisable anchor
    return formatWeekRange(iso).split(' – ')[0];
  }
}

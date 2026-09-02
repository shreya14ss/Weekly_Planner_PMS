import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';

import { TableModule } from 'primeng/table';

import { HealthSummary, TrackerRow, TrackKey } from '@features/dashboard/dashboard-aggregations';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

interface HealthPill {
  key: keyof HealthSummary;
  /** Corresponding TrackKey in TrackerRow.trackStatus.key — used for filtering. */
  trackKey: TrackKey;
  label: string;
  sub: string;
  cls: string;
  dot: string;
}

/**
 * Port of legacy renderWeeklyTracker — health-summary pills on top and
 * a full table with PROJECT / CLIENT / WEEKLY TARGET / TASK STATUS /
 * TRACK STATUS. Clicking a pill filters the table below to that
 * bucket; clicking the active pill again clears the filter.
 * Fully-completed projects are excluded upstream.
 */
@Component({
  selector: 'app-weekly-schedule-tracker',
  standalone: true,
  imports: [TableModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './weekly-schedule-tracker.component.html',
  styleUrl: './weekly-schedule-tracker.component.scss',
})
export class WeeklyScheduleTrackerComponent {
  readonly rows = input.required<TrackerRow[]>();
  readonly summary = input.required<HealthSummary>();

  protected readonly selectedKey = signal<TrackKey | null>(null);

  protected readonly pills: HealthPill[] = [
    { key: 'onTrack', trackKey: 'ok', label: 'On Track', sub: 'projects healthy', cls: 'hp-ok', dot: '#059669' },
    { key: 'atRisk', trackKey: 'risk', label: 'At Risk', sub: 'partial progress', cls: 'hp-risk', dot: '#D97706' },
    { key: 'delayed', trackKey: 'late', label: 'Delayed / No Updates', sub: 'past due or empty', cls: 'hp-late', dot: '#DC2626' },
    { key: 'onHold', trackKey: 'hold', label: 'Stuck / On Hold', sub: 'blocked, needs action', cls: 'hp-hold', dot: '#7C3AED' },
    { key: 'completed', trackKey: 'done', label: 'Completed', sub: 'handed over / done', cls: 'hp-done', dot: '#10B981' },
    { key: 'notSet', trackKey: 'ns', label: 'Not Set', sub: 'no target filled', cls: 'hp-ns', dot: '#9CA3AF' },
  ];

  protected readonly visibleRows = computed<TrackerRow[]>(() => {
    const key = this.selectedKey();
    const all = this.rows();
    return key === null ? all : all.filter((r) => r.trackStatus.key === key);
  });

  protected readonly activeLabel = computed(() => {
    const key = this.selectedKey();
    if (!key) return null;
    return this.pills.find((p) => p.trackKey === key)?.label ?? null;
  });

  protected togglePill(pill: HealthPill): void {
    // Ignore disabled pills (0 count) — nothing to show
    if (this.summary()[pill.key] === 0) return;
    this.selectedKey.update((cur) => (cur === pill.trackKey ? null : pill.trackKey));
  }

  protected clearFilter(): void {
    this.selectedKey.set(null);
  }

  protected trackCls(key: TrackKey): string {
    return `tk-${key}`;
  }

  protected segPct(count: number, total: number): number {
    return total === 0 ? 0 : (count / total) * 100;
  }
}

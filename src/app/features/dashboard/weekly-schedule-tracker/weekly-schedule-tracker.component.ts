import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TableModule } from 'primeng/table';

import { HealthSummary, TrackerRow, TrackKey } from '@features/dashboard/dashboard-aggregations';

interface HealthPill {
  key: keyof HealthSummary;
  label: string;
  sub: string;
  cls: string;
  dot: string;
}

/**
 * Port of legacy renderWeeklyTracker — health-summary pills on top and
 * a full table with PROJECT / CLIENT / WEEKLY TARGET / TASK STATUS /
 * TRACK STATUS. Fully-completed projects are excluded upstream.
 */
@Component({
  selector: 'app-weekly-schedule-tracker',
  standalone: true,
  imports: [TableModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './weekly-schedule-tracker.component.html',
  styleUrl: './weekly-schedule-tracker.component.scss',
})
export class WeeklyScheduleTrackerComponent {
  readonly rows = input.required<TrackerRow[]>();
  readonly summary = input.required<HealthSummary>();

  protected readonly pills: HealthPill[] = [
    { key: 'onTrack', label: 'On Track', sub: 'projects healthy', cls: 'hp-ok', dot: '#059669' },
    { key: 'atRisk', label: 'At Risk', sub: 'partial progress', cls: 'hp-risk', dot: '#D97706' },
    { key: 'delayed', label: 'Delayed / No Updates', sub: 'past due or empty', cls: 'hp-late', dot: '#DC2626' },
    { key: 'onHold', label: 'Stuck / On Hold', sub: 'blocked, needs action', cls: 'hp-hold', dot: '#7C3AED' },
    { key: 'completed', label: 'Completed', sub: 'handed over / done', cls: 'hp-done', dot: '#10B981' },
    { key: 'notSet', label: 'Not Set', sub: 'no target filled', cls: 'hp-ns', dot: '#9CA3AF' },
  ];

  protected trackCls(key: TrackKey): string {
    return `tk-${key}`;
  }

  protected segPct(count: number, total: number): number {
    return total === 0 ? 0 : (count / total) * 100;
  }
}

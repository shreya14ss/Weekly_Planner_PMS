import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TableModule } from 'primeng/table';

import { EngineerRow } from '@features/dashboard/dashboard-aggregations';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

/**
 * Per-engineer stats table. Each row leads with a health-tinted
 * avatar + status line; numeric columns render as compact colour-coded
 * badges so the row scans left-to-right.
 */
@Component({
  selector: 'app-engineer-performance',
  standalone: true,
  imports: [TableModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './engineer-performance.component.html',
  styleUrl: './engineer-performance.component.scss',
})
export class EngineerPerformanceComponent {
  readonly rows = input.required<EngineerRow[]>();

  protected pct(part: number, total: number): number {
    return total === 0 ? 0 : (part / total) * 100;
  }

  protected avatarBg(row: EngineerRow): string {
    return this.healthColor(row);
  }

  protected healthColor(row: EngineerRow): string {
    if (row.health === 'bad') return '#dc2626';
    if (row.health === 'warning') return '#d97706';
    return '#059669';
  }

  protected healthLabel(row: EngineerRow): string {
    if (row.health === 'bad') return 'Needs attention';
    if (row.health === 'warning') return 'Watch';
    return 'On track';
  }
}

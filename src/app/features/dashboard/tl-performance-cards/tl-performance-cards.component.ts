import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TlPerformanceRow } from '@features/dashboard/dashboard-aggregations';

/**
 * Port of legacy renderTLTrend — one card per person with task
 * completion mini-bar, count badges, and a delay-rate readout.
 * Sorted upstream by highest delayed count.
 */
@Component({
  selector: 'app-tl-performance-cards',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './tl-performance-cards.component.html',
  styleUrl: './tl-performance-cards.component.scss',
})
export class TlPerformanceCardsComponent {
  readonly rows = input.required<TlPerformanceRow[]>();

  protected pct(part: number, total: number): number {
    return total === 0 ? 0 : (part / total) * 100;
  }

  protected roleLabel(role: string): string {
    if (role === 'pm') return 'PM';
    if (role === 'tl') return 'TL';
    if (role === 'user') return 'ENG';
    return '';
  }

  protected avatarBg(row: TlPerformanceRow): string {
    if (row.health === 'bad') return '#dc2626';
    if (row.health === 'warning') return '#d97706';
    return '#059669';
  }

  protected healthIcon(row: TlPerformanceRow): string {
    return row.health === 'bad' ? '●' : row.health === 'warning' ? '●' : '●';
  }

  protected healthColor(row: TlPerformanceRow): string {
    if (row.health === 'bad') return '#dc2626';
    if (row.health === 'warning') return '#d97706';
    return '#059669';
  }

  protected delayAssessment(row: TlPerformanceRow): string {
    if (row.delayRate >= 40) return '⚠ High — needs review';
    if (row.delayRate >= 20) return 'ℹ Moderate';
    return '✓ On track';
  }
}

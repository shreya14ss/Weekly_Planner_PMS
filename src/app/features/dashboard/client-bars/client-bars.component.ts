import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { ClientBar } from '@features/dashboard/dashboard-aggregations';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

interface LeaderboardRow {
  client: string;
  total: number;
  active: number;
  done: number;
  hold: number;
  other: number;
  attention: number;
}

/**
 * Compact per-client leaderboard. Each row = client name, a slim
 * stacked bar showing status composition, and the total count. Clients
 * are ordered by "actionable" work (on-hold + other/unknown) descending
 * so the ones that need attention float to the top. Pure HTML/CSS —
 * dropped ApexCharts here because at ~12 clients on 47 "not filled"
 * projects the chart was mostly gray with wasted axis space.
 */
@Component({
  selector: 'app-client-bars',
  standalone: true,
  imports: [EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (bars().length === 0) {
      <app-empty-state variant="chart" subtitle="No client breakdown available." />
    } @else {
      <div class="legend">
        <span class="lg lg-active"><span class="dot"></span> Active</span>
        <span class="lg lg-done"><span class="dot"></span> Completed</span>
        <span class="lg lg-hold"><span class="dot"></span> On Hold</span>
        <span class="lg lg-other"><span class="dot"></span> Other</span>
      </div>

      <ul class="board">
        @for (r of rows(); track r.client) {
          <li class="row">
            <span class="client" [title]="r.client">{{ r.client }}</span>
            <div class="bar" [attr.aria-label]="r.client + ' status breakdown'">
              @if (r.active > 0) {
                <span class="seg s-active" [style.width.%]="pct(r.active, r.total)"
                      [title]="r.active + ' active'">{{ segLabel(r.active, r.total) }}</span>
              }
              @if (r.done > 0) {
                <span class="seg s-done" [style.width.%]="pct(r.done, r.total)"
                      [title]="r.done + ' completed'">{{ segLabel(r.done, r.total) }}</span>
              }
              @if (r.hold > 0) {
                <span class="seg s-hold" [style.width.%]="pct(r.hold, r.total)"
                      [title]="r.hold + ' on hold'">{{ segLabel(r.hold, r.total) }}</span>
              }
              @if (r.other > 0) {
                <span class="seg s-other" [style.width.%]="pct(r.other, r.total)"
                      [title]="r.other + ' other / not set'">{{ segLabel(r.other, r.total) }}</span>
              }
            </div>
            <span class="total">{{ r.total }}</span>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './client-bars.component.scss',
})
export class ClientBarsComponent {
  readonly bars = input.required<ClientBar[]>();

  /**
   * Enriched + reordered. Sort key = attention (hold + other) desc,
   * then total desc — puts the clients who need action first.
   */
  protected readonly rows = computed<LeaderboardRow[]>(() => {
    return this.bars()
      .map((b) => ({
        ...b,
        attention: b.hold + b.other,
      }))
      .sort((a, b) => b.attention - a.attention || b.total - a.total);
  });

  protected pct(part: number, total: number): number {
    if (total <= 0) return 0;
    return (part / total) * 100;
  }

  /** Only render the number inside a segment if it's wide enough to fit. */
  protected segLabel(part: number, total: number): string {
    if (total <= 0) return '';
    return this.pct(part, total) >= 12 ? String(part) : '';
  }
}

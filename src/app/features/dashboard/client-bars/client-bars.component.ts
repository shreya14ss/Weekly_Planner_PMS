import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { ClientBar } from '@features/dashboard/dashboard-aggregations';

/**
 * Horizontal stacked bar per client — Active / Done / Hold / Other.
 * Legend below.
 */
@Component({
  selector: 'app-client-bars',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (bars().length === 0) {
      <div class="text-slate-400 text-sm py-6 text-center italic">
        No client breakdown available.
      </div>
    } @else {
      <div class="list">
        @for (b of bars(); track b.client) {
          <div class="row">
            <div class="label" [title]="b.client">{{ b.client }}</div>
            <div class="track">
              <div class="fill" [style.width.%]="widthPct(b)">
                @if (b.active) {
                  <span class="seg seg-active" [style.width.%]="segPct(b, b.active)"></span>
                }
                @if (b.done) {
                  <span class="seg seg-done" [style.width.%]="segPct(b, b.done)"></span>
                }
                @if (b.hold) {
                  <span class="seg seg-hold" [style.width.%]="segPct(b, b.hold)"></span>
                }
                @if (b.other) {
                  <span class="seg seg-other" [style.width.%]="segPct(b, b.other)"></span>
                }
              </div>
            </div>
            <div class="count">{{ b.total }}</div>
          </div>
        }
      </div>

      <div class="legend">
        <span class="l"><span class="dot dot-active"></span>Active</span>
        <span class="l"><span class="dot dot-done"></span>Completed</span>
        <span class="l"><span class="dot dot-hold"></span>On Hold</span>
        <span class="l"><span class="dot dot-other"></span>Other</span>
      </div>
    }
  `,
  styleUrl: './client-bars.component.scss',
})
export class ClientBarsComponent {
  readonly bars = input.required<ClientBar[]>();

  protected readonly maxTotal = computed(() =>
    Math.max(1, ...this.bars().map((b) => b.total)),
  );

  protected widthPct(b: ClientBar): number {
    return Math.round((b.total / this.maxTotal()) * 100);
  }

  protected segPct(b: ClientBar, count: number): number {
    return b.total === 0 ? 0 : Math.round((count / b.total) * 100);
  }
}

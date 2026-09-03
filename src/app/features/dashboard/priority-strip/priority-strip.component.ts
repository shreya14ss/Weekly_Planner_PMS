import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

import { Kpis } from '@features/dashboard/dashboard-aggregations';
import { DashStatusFilter } from '@features/dashboard/dashboard-filter.service';

interface PriorityPill {
  key: DashStatusFilter;
  label: string;
  count: number;
  tone: 'delayed' | 'hold' | 'notfilled' | 'ok';
  icon: string;
}

/**
 * Above-the-fold triage strip. Shows the "things that need attention"
 * headline counts as clickable pills — clicking one applies the
 * matching Status filter so the whole dashboard narrows to that
 * bucket. When everything is at zero, an "All caught up" pill takes
 * over so the strip is never empty.
 */
@Component({
  selector: 'app-priority-strip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="strip"
      [class.strip--compact]="compact()"
      role="group"
      aria-label="Priority summary"
    >
      <span class="label"><i class="pi pi-flag-fill"></i> Attention</span>
      @for (pill of pills(); track pill.key) {
        <button
          type="button"
          class="pill"
          [class.pill--active]="activeStatus() === pill.key"
          [attr.data-tone]="pill.tone"
          (click)="filter.emit(pill.key)"
        >
          <i class="pi" [class]="pill.icon" aria-hidden="true"></i>
          <span class="num">{{ pill.count }}</span>
          <span class="txt">{{ pill.label }}</span>
        </button>
      }
      @if (allClear()) {
        <span class="clear-pill">
          <i class="pi pi-check-circle"></i>
          All caught up
        </span>
      }
    </div>
  `,
  styleUrl: './priority-strip.component.scss',
})
export class PriorityStripComponent {
  readonly kpis = input.required<Kpis>();
  readonly activeStatus = input.required<DashStatusFilter>();
  /** When true, drop the outer border/background — useful when embedded in a nav row. */
  readonly compact = input<boolean>(false);
  readonly filter = output<DashStatusFilter>();

  protected readonly pills = computed<PriorityPill[]>(() => {
    const k = this.kpis();
    return [
      { key: 'delayed', label: 'past target', count: k.delayed, tone: 'delayed', icon: 'pi-exclamation-triangle' },
      { key: 'hold', label: 'on hold', count: k.hold, tone: 'hold', icon: 'pi-pause-circle' },
      { key: 'no-update', label: 'not updated this week', count: k.notFilled, tone: 'notfilled', icon: 'pi-file-edit' },
    ].filter((p) => p.count > 0) as PriorityPill[];
  });

  protected readonly allClear = computed(() => this.pills().length === 0);
}

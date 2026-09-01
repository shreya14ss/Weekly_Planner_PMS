import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { WeekStateService } from '@core/services/week-state.service';
import { formatWeekRange } from '@shared/utils/date.util';

/**
 * Compact week-navigation control for the app-shell header.
 * Prev / label / Next / "Go to current" — mirrors the legacy layout.
 */
@Component({
  selector: 'app-week-nav',
  standalone: true,
  imports: [ButtonModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-1.5 bg-white/10 border border-white/15 rounded-lg px-1.5 py-1">
      <p-button
        icon="pi pi-chevron-left"
        [rounded]="true"
        [text]="true"
        size="small"
        severity="secondary"
        class="!text-white"
        pTooltip="Previous week"
        tooltipPosition="bottom"
        (onClick)="state.prevWeek()"
      />
      <div class="text-center px-2 min-w-[170px] leading-tight">
        <div class="text-[10px] font-semibold tracking-wider uppercase text-white/50">Week of</div>
        <div class="text-[13px] font-bold text-rbh-accent">{{ label() }}</div>
      </div>
      <p-button
        icon="pi pi-chevron-right"
        [rounded]="true"
        [text]="true"
        size="small"
        severity="secondary"
        class="!text-white"
        pTooltip="Next week"
        tooltipPosition="bottom"
        (onClick)="state.nextWeek()"
      />
      @if (!isCurrent()) {
        <p-button
          icon="pi pi-calendar"
          label="Today"
          size="small"
          severity="warn"
          [text]="true"
          pTooltip="Jump to the current week"
          tooltipPosition="bottom"
          (onClick)="state.goToCurrentWeek()"
        />
      }
    </div>
  `,
})
export class WeekNavComponent {
  protected readonly state = inject(WeekStateService);
  protected readonly label = computed(() => formatWeekRange(this.state.loadedWeek()));
  protected readonly isCurrent = this.state.isCurrentWeek;
}

import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  computed,
  inject,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { DatePickerModule } from 'primeng/datepicker';
import { Popover, PopoverModule } from 'primeng/popover';
import { TooltipModule } from 'primeng/tooltip';

import { WeekStateService } from '@core/services/week-state.service';
import { formatWeekRange, mondayOf, parseIso, saturdayOf } from '@shared/utils/date.util';

/**
 * Compact week-navigation control for the app-shell header.
 * Prev / label / Next / "Go to current" — mirrors the legacy layout.
 * Clicking the label opens a calendar popover; picking any date snaps
 * to the Monday of that week (so users don't have to hunt for Mondays).
 */
@Component({
  selector: 'app-week-nav',
  standalone: true,
  imports: [FormsModule, ButtonModule, DatePickerModule, PopoverModule, TooltipModule],
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

      <button
        type="button"
        class="week-btn"
        pTooltip="Pick any date — snaps to that week"
        tooltipPosition="bottom"
        (click)="popover.toggle($event)"
      >
        <div class="text-[10px] font-semibold tracking-wider uppercase text-white/50">
          Week of
        </div>
        <div class="text-[13px] font-bold text-rbh-accent flex items-center gap-1.5 justify-center">
          {{ label() }}
          <i class="pi pi-calendar text-[10px] opacity-70"></i>
        </div>
      </button>

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

    <p-popover
      #popover
      [dismissable]="true"
      appendTo="body"
      styleClass="rbh-week-picker-pop"
    >
      <div class="week-picker">
        <div class="week-picker-head">
          <i class="pi pi-calendar"></i>
          <span>Pick any date to jump to that week</span>
        </div>
        <p-datepicker
          [ngModel]="pickerValue()"
          (onSelect)="onDateSelected($event, popover)"
          [inline]="true"
          [showWeek]="true"
        >
          <!-- Custom day chip — controls all visual states so PrimeNG's
               default day/selected/today styles don't clash with the RBH
               accent palette. -->
          <ng-template pTemplate="date" let-date>
            <span
              class="day-cell"
              [class.in-week]="isInLoadedWeek(date)"
              [class.selected]="isSelected(date)"
              [class.today]="date.today"
              [class.other-month]="date.otherMonth"
            >
              {{ date.day }}
            </span>
          </ng-template>
        </p-datepicker>
        <div class="week-picker-foot">
          <b>{{ label() }}</b>
        </div>
      </div>
    </p-popover>
  `,
  styles: [`
    :host { display: inline-block; }

    .week-btn {
      background: transparent;
      border: 0;
      padding: 2px 8px;
      min-width: 170px;
      text-align: center;
      line-height: 1.15;
      cursor: pointer;
      border-radius: 6px;
      transition: background 0.15s ease;
    }
    .week-btn:hover { background: rgba(255, 255, 255, 0.08); }

    .week-picker { min-width: 260px; padding: 4px 2px; }
    .week-picker-head {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      color: #475569;
      padding: 4px 8px 10px;
      border-bottom: 1px solid #eef2f7;
      margin-bottom: 8px;

      i { color: var(--shell-accent, #e8721a); }
    }
    .week-picker-foot {
      padding: 10px 8px 4px;
      border-top: 1px solid #eef2f7;
      margin-top: 8px;
      text-align: center;
      font-size: 12px;
      color: #64748b;
      b { color: var(--shell-accent, #e8721a); }
    }

    .day-cell {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      font-size: 12px;
      color: #334155;
      transition: background-color 0.12s ease, color 0.12s ease, box-shadow 0.12s ease;
    }
    .day-cell.other-month { color: #cbd5e1; }
    .day-cell.in-week {
      background: color-mix(in srgb, var(--shell-accent, #e8721a) 14%, transparent);
      color: color-mix(in srgb, var(--shell-accent, #e8721a) 70%, #0f172a);
      font-weight: 700;
    }
    .day-cell.today:not(.selected) {
      box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--shell-accent, #e8721a) 45%, transparent);
    }
    .day-cell.selected {
      background: var(--shell-accent, #e8721a);
      color: #fff;
      font-weight: 800;
      box-shadow: 0 4px 12px -2px color-mix(in srgb, var(--shell-accent, #e8721a) 55%, transparent);
    }
  `],
})
export class WeekNavComponent {
  protected readonly state = inject(WeekStateService);

  @ViewChild('popover') protected popover?: Popover;

  protected readonly label = computed(() => formatWeekRange(this.state.loadedWeek()));
  protected readonly isCurrent = this.state.isCurrentWeek;

  /** DatePicker `[ngModel]` — a Date pointing at the Monday of the loaded week. */
  protected readonly pickerValue = computed(() => parseIso(this.state.loadedWeek()));

  /** Highlight helper — true if `date` (from PrimeNG dateTemplate) falls in loaded week. */
  protected isInLoadedWeek = (cell: { day: number; month: number; year: number }): boolean => {
    const start = this.state.loadedWeek();
    const end = saturdayOf(start); // Mon..Sat
    const iso = this.cellIso(cell);
    return iso >= start && iso <= end;
  };

  /** True when the cell matches the Monday the picker is currently anchored on. */
  protected isSelected = (cell: { day: number; month: number; year: number }): boolean => {
    return this.cellIso(cell) === this.state.loadedWeek();
  };

  private cellIso(cell: { day: number; month: number; year: number }): string {
    return `${cell.year}-${String(cell.month + 1).padStart(2, '0')}-${String(cell.day).padStart(2, '0')}`;
  }

  protected onDateSelected(date: Date, popover: Popover): void {
    // The service's loadWeek() normalises to the Monday internally.
    const monday = mondayOf(date);
    void this.state.loadWeek(monday);
    popover.hide();
  }
}

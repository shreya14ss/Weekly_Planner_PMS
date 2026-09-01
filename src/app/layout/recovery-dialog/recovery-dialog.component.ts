import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  model,
  signal,
} from '@angular/core';

import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { DatabaseService } from '@core/pouchdb/database.service';
import { WeekStateService } from '@core/services/week-state.service';
import { WeekDoc } from '@models/week';
import { IsoDate } from '@models/common';
import { currentWeekMonday, formatWeekRange } from '@shared/utils/date.util';

interface WeekSummary {
  weekStart: IsoDate;
  label: string;
  projectCount: number;
  taskCount: number;
  filledCount: number;
  isCurrent: boolean;
  isViewing: boolean;
}

/**
 * Legacy "Recover Tasks" affordance. Because PouchDB persists week docs
 * cleanly, this is really a "week history" navigator — every stored
 * week with its project / task counts and a jump-to button.
 */
@Component({
  selector: 'app-recovery-dialog',
  standalone: true,
  imports: [DialogModule, ButtonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './recovery-dialog.component.html',
  styleUrl: './recovery-dialog.component.scss',
})
export class RecoveryDialogComponent {
  private readonly db = inject(DatabaseService);
  private readonly state = inject(WeekStateService);

  readonly visible = model.required<boolean>();

  private readonly weeks = signal<WeekSummary[]>([]);
  readonly loading = signal(false);

  protected readonly currentWeek = this.state.loadedWeek;

  readonly summaries = computed(() => {
    const cur = currentWeekMonday();
    const loaded = this.currentWeek();
    return this.weeks().map<WeekSummary>((w) => ({
      ...w,
      isCurrent: w.weekStart === cur,
      isViewing: w.weekStart === loaded,
    }));
  });

  constructor() {
    // Refresh the list every time the dialog opens.
    effect(() => {
      if (this.visible()) void this.refresh();
    });
  }

  async refresh(): Promise<void> {
    this.loading.set(true);
    try {
      const docs = await this.db.allByType<WeekDoc>('week');
      const rows: WeekSummary[] = docs.map((doc) => this.summarise(doc));
      rows.sort((a, b) => b.weekStart.localeCompare(a.weekStart));
      this.weeks.set(rows);
    } finally {
      this.loading.set(false);
    }
  }

  async load(weekStart: IsoDate): Promise<void> {
    await this.state.loadWeek(weekStart);
    this.visible.set(false);
  }

  close(): void {
    this.visible.set(false);
  }

  private summarise(doc: WeekDoc): WeekSummary {
    let taskCount = 0;
    let filledCount = 0;
    for (const entry of Object.values(doc.entries ?? {})) {
      if (
        entry.weeklyTarget ||
        entry.description ||
        entry.status ||
        entry.targetDate ||
        (entry.weekTasks && entry.weekTasks.length > 0)
      ) {
        filledCount++;
      }
      taskCount += entry.weekTasks?.length ?? 0;
    }
    return {
      weekStart: doc.weekStart,
      label: formatWeekRange(doc.weekStart),
      projectCount: Object.keys(doc.entries ?? {}).length,
      taskCount,
      filledCount,
      isCurrent: false,
      isViewing: false,
    };
  }
}

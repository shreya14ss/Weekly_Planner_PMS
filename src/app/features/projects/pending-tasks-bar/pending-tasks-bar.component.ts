import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { ProjectRepository } from '@core/pouchdb/project.repository';
import { UserRepository } from '@core/pouchdb/user.repository';
import { WeekStateService } from '@core/services/week-state.service';
import { PendingTaskItem } from '@models/week';
import { IsoDate } from '@models/common';
import {
  addWeeks,
  daysBetween,
  formatWeekRange,
  todayIso,
} from '@shared/utils/date.util';

interface PendingRow {
  item: PendingTaskItem;
  rank: number;
  delayDays: number;
  projectClient: string;
  projectName: string;
  assigneeNames: string[];
  originWeekLabel: string;
}

/**
 * Priority queue of pending tasks from prior weeks. Sorted by delay
 * days (most delayed first). Each row lets a PM/TL move the task
 * into the current or the next week.
 */
@Component({
  selector: 'app-pending-tasks-bar',
  standalone: true,
  imports: [ButtonModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pending-tasks-bar.component.html',
  styleUrl: './pending-tasks-bar.component.scss',
})
export class PendingTasksBarComponent {
  private readonly state = inject(WeekStateService);
  private readonly projects = inject(ProjectRepository);
  private readonly users = inject(UserRepository);

  private readonly _items = signal<PendingTaskItem[]>([]);
  private readonly _loading = signal(false);

  protected readonly collapsed = signal(false);

  protected readonly loading = this._loading.asReadonly();

  protected readonly rows = computed<PendingRow[]>(() => {
    const items = this._items();
    const today = todayIso();
    const rows = items.map<PendingRow>((item) => {
      const p = this.projects.get(item.projectId);
      const delayDays = Math.max(
        0,
        daysBetween(item.task.originalWeek ?? item.task.carriedWeek ?? item.week, today),
      );
      return {
        item,
        rank: 0, // filled in after sort
        delayDays,
        projectClient: p?.client ?? 'Unknown',
        projectName: p?.name && p.name !== '—' ? p.name : (p?.client ?? '') + ' Site',
        assigneeNames: (item.task.assignedTo ?? [])
          .map((uid) => this.users.get(uid)?.name)
          .filter((n): n is string => !!n),
        originWeekLabel: formatWeekRange(item.task.originalWeek ?? item.week),
      };
    });

    rows.sort((a, b) => b.delayDays - a.delayDays);
    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  });

  protected readonly total = computed(() => this._items().length);
  protected readonly currentWeek = this.state.loadedWeek;
  protected readonly nextWeekIso = computed<IsoDate>(() => addWeeks(this.currentWeek(), 1));

  constructor() {
    // Refresh whenever the loaded week changes. `untracked` prevents
    // signals read inside `refresh` from re-firing this effect.
    effect(() => {
      this.state.loadedWeek();
      untracked(() => this.refresh());
    });
  }

  async refresh(): Promise<void> {
    this._loading.set(true);
    try {
      this._items.set(await this.state.loadPending());
    } finally {
      this._loading.set(false);
    }
  }

  async move(row: PendingRow, toWeek: IsoDate): Promise<void> {
    await this.state.carryTask(row.item.week, row.item.projectId, row.item.task.id, toWeek);
    await this.refresh();
  }

  async moveAllToCurrent(): Promise<void> {
    const current = this.currentWeek();
    // Snapshot first — carries mutate the list.
    for (const row of [...this.rows()]) {
      await this.state.carryTask(row.item.week, row.item.projectId, row.item.task.id, current);
    }
    await this.refresh();
  }

  toggle(): void {
    this.collapsed.update((c) => !c);
  }
}

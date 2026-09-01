import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { ProjectDoc } from '@models/project';
import { TaskStatus, WeekTask } from '@models/week';
import { AuthService } from '@core/services/auth.service';
import { WeekStateService } from '@core/services/week-state.service';
import { canManageTasks } from '@core/services/project-permissions';
import { TaskRowComponent } from '@features/projects/task-row/task-row.component';

interface TaskCounts {
  total: number;
  done: number;
  inProgress: number;
  hold: number;
  delay: number;
  notStarted: number;
}

const EMPTY_COUNTS: TaskCounts = {
  total: 0,
  done: 0,
  inProgress: 0,
  hold: 0,
  delay: 0,
  notStarted: 0,
};

/**
 * Weekly task list for a single project. Renders:
 *  - Header row with "Add Task" button (PM/TL only)
 *  - A row per task via <app-task-row>
 *  - A progress summary strip at the bottom
 */
@Component({
  selector: 'app-task-list',
  standalone: true,
  imports: [ButtonModule, TooltipModule, TaskRowComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-list.component.html',
  styleUrl: './task-list.component.scss',
})
export class TaskListComponent {
  private readonly auth = inject(AuthService);
  private readonly state = inject(WeekStateService);

  readonly project = input.required<ProjectDoc>();

  protected readonly tasks = computed<WeekTask[]>(() => {
    // Bind to the entries signal so this re-computes on every mutation.
    const _entries = this.state.entries();
    return _entries[this.project()._id]?.weekTasks ?? [];
  });

  protected readonly canManage = computed(() =>
    canManageTasks(this.auth.currentUser(), this.project()),
  );

  protected readonly counts = computed<TaskCounts>(() => {
    const c: TaskCounts = { ...EMPTY_COUNTS };
    for (const t of this.tasks()) {
      c.total++;
      const s: TaskStatus = t.status || 'not-started';
      if (s === 'completed') c.done++;
      else if (s === 'in-progress' || s === 'todo') c.inProgress++;
      else if (s === 'hold') c.hold++;
      else if (s === 'delay') c.delay++;
      else c.notStarted++;
    }
    return c;
  });

  protected readonly progressPct = computed(() => {
    const c = this.counts();
    return c.total === 0 ? 0 : Math.round((c.done / c.total) * 100);
  });

  protected readonly segments = computed(() => {
    const c = this.counts();
    if (c.total === 0) return [];
    const pct = (n: number) => (n / c.total) * 100;
    return [
      { color: '#059669', width: pct(c.done) },
      { color: '#2563eb', width: pct(c.inProgress) },
      { color: '#d97706', width: pct(c.hold) },
      { color: '#dc2626', width: pct(c.delay) },
      { color: '#d1d5db', width: pct(c.notStarted) },
    ].filter((s) => s.width > 0);
  });

  addTask(): void {
    if (!this.canManage()) return;
    this.state.addTask(this.project()._id, '');
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { TooltipModule } from 'primeng/tooltip';

import { WeekTask, TaskStatus } from '@models/week';
import { IsoDate } from '@models/common';
import { ProjectDoc } from '@models/project';
import { AuthService } from '@core/services/auth.service';
import { WeekStateService } from '@core/services/week-state.service';
import { canEditTask, canManageTasks } from '@core/services/project-permissions';
import {
  daysBetween,
  saturdayOf,
  addWeeks,
  todayIso,
  toIsoDate,
  formatWeekRange,
} from '@shared/utils/date.util';
import { TaskStatusPillsComponent } from '@features/projects/task-status-pills/task-status-pills.component';
import { TaskAssigneesComponent } from '@features/projects/task-assignees/task-assignees.component';

/**
 * A single weekly task row. Presentation only — all mutations bubble
 * out via calls into WeekStateService (dirty tracking centralised).
 */
@Component({
  selector: 'app-task-row',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    InputTextModule,
    DatePickerModule,
    TooltipModule,
    TaskStatusPillsComponent,
    TaskAssigneesComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-row.component.html',
  styleUrl: './task-row.component.scss',
})
export class TaskRowComponent {
  protected readonly auth = inject(AuthService);
  private readonly state = inject(WeekStateService);

  readonly project = input.required<ProjectDoc>();
  readonly task = input.required<WeekTask>();
  readonly index = input.required<number>();
  readonly removed = output<string>();

  protected readonly canEdit = computed(() =>
    canEditTask(this.auth.currentUser(), this.project(), this.task()),
  );

  /** Only PM / TL can add/remove tasks — a plain assignee shouldn't wipe rows. */
  protected readonly canManage = computed(() =>
    canManageTasks(this.auth.currentUser(), this.project()),
  );

  protected readonly rowClass = computed(() => `status-${this.task().status || 'not-started'}`);

  protected readonly dueDate = computed<Date | null>(() => {
    const iso = this.task().taskDueDate;
    return iso ? new Date(iso + 'T00:00:00') : null;
  });

  /** Signed day count vs today. Positive = future, negative = past. */
  protected readonly dueDelta = computed<number | null>(() => {
    const iso = this.task().taskDueDate;
    if (!iso) return null;
    return daysBetween(todayIso(), iso);
  });

  /**
   * Descriptor used by the template — encapsulates label + colour class
   * so the template stays terse.
   */
  protected readonly dueBadge = computed<{ label: string; cls: string } | null>(() => {
    const delta = this.dueDelta();
    if (delta === null || this.task().status === 'completed') return null;
    if (delta < 0) return { label: `${-delta}d overdue`, cls: 'due-overdue' };
    if (delta === 0) return { label: 'Due today', cls: 'due-soon' };
    if (delta <= 3) return { label: `Due in ${delta}d`, cls: 'due-soon' };
    return { label: `${delta}d left`, cls: 'due-ok' };
  });

  /** Days delayed since the task's original week — only meaningful for delay/carried tasks. */
  protected readonly delayDays = computed<number | null>(() => {
    const t = this.task();
    const origin = t.originalWeek ?? t.carriedWeek;
    if (!origin) return null;
    const delta = daysBetween(origin, todayIso());
    return delta > 0 ? delta : null;
  });

  protected readonly delayOriginLabel = computed(() => {
    const t = this.task();
    const origin = t.originalWeek ?? t.carriedWeek;
    return origin ? formatWeekRange(origin) : '';
  });

  /**
   * "Move → next week" is only offered when:
   *   - the viewer can manage tasks (PM/TL)
   *   - the task isn't already completed
   *   - we're viewing the current week (otherwise "next week" is ambiguous
   *     — the Pending Tasks Bar handles carrying from historical weeks).
   */
  protected readonly canMoveToNextWeek = computed(
    () =>
      this.canManage() &&
      this.task().status !== 'completed' &&
      this.state.isCurrentWeek(),
  );

  onNameChange(v: string): void {
    if (!this.canEdit()) return;
    this.state.updateTask(this.project()._id, this.task().id, { name: v });
  }

  onRemarkChange(v: string): void {
    if (!this.canEdit()) return;
    this.state.updateTask(this.project()._id, this.task().id, { remark: v });
  }

  onStatusChange(s: TaskStatus): void {
    if (!this.canEdit()) return;
    this.state.setTaskStatus(this.project()._id, this.task().id, s);
  }

  onAssigneesChange(ids: string[]): void {
    if (!this.canManage()) return;
    this.state.setAssignees(this.project()._id, this.task().id, ids);
  }

  onDueDateChange(d: Date | null): void {
    if (!this.canEdit()) return;
    const iso: IsoDate | undefined = d ? toIsoDate(d) : undefined;
    this.state.updateTask(this.project()._id, this.task().id, { taskDueDate: iso });
  }

  /** Quick-set to Saturday of the current / next / +2 week. */
  onQuickDue(weeksAhead: 0 | 1 | 2): void {
    if (!this.canEdit()) return;
    const iso = saturdayOf(addWeeks(this.state.loadedWeek(), weeksAhead));
    this.state.updateTask(this.project()._id, this.task().id, { taskDueDate: iso });
  }

  /**
   * Carry this task into next week and remove it from the current week.
   * Three steps, intentionally autosaved as one unit:
   *
   *   1. `carryTask` copies the task into next week (direct repo write —
   *      not the dirty flow, since next week isn't the loaded one).
   *   2. `removeTask` strips it from the current week via `mutateTasks`
   *      (dirty-tracked local mutation).
   *   3. `saveProject` persists the current-week entry so the removal
   *      isn't lost on discard.
   *
   * The explicit save here breaks from the usual "edit → save button"
   * flow, but a move is a deliberate commit-level action and leaving it
   * half-persisted (next-week copy saved, current-week removal dirty)
   * creates a window where discarding duplicates the task.
   */
  async onMoveToNextWeek(): Promise<void> {
    if (!this.canMoveToNextWeek()) return;
    const t = this.task();
    const projectId = this.project()._id;
    const projectName = this.project().name;
    const current = this.state.loadedWeek();
    const next = addWeeks(current, 1);

    await this.state.carryTask(current, projectId, t.id, next);
    this.state.removeTask(projectId, t.id, projectName);
    await this.state.saveProject(projectId, projectName);
    this.removed.emit(t.id);
  }

  onRemove(): void {
    // Deletion is PM-only — TL/User can still add and edit tasks, but
    // removing a task from the record is a destructive action reserved
    // for the project manager.
    if (!this.auth.isPM()) return;
    this.state.removeTask(this.project()._id, this.task().id, this.project().name);
    this.removed.emit(this.task().id);
  }
}

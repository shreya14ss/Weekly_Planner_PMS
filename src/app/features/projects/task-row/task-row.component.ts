import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TooltipModule } from 'primeng/tooltip';

import { WeekTask, TaskStatus } from '@models/week';
import { ProjectDoc } from '@models/project';
import { AuthService } from '@core/services/auth.service';
import { WeekStateService } from '@core/services/week-state.service';
import { canEditTask, canManageTasks } from '@core/services/project-permissions';
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
    TooltipModule,
    TaskStatusPillsComponent,
    TaskAssigneesComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './task-row.component.html',
  styleUrl: './task-row.component.scss',
})
export class TaskRowComponent {
  private readonly auth = inject(AuthService);
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

  onRemove(): void {
    if (!this.canManage()) return;
    this.state.removeTask(this.project()._id, this.task().id);
    this.removed.emit(this.task().id);
  }
}

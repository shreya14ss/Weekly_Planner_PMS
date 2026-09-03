import { ChangeDetectionStrategy, Component, computed, inject, input, model, output } from '@angular/core';

import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';

import { ProjectRepository } from '@core/pouchdb/project.repository';
import { UserRepository } from '@core/pouchdb/user.repository';
import { WeekStateService } from '@core/services/week-state.service';
import { WeekTask } from '@models/week';
import { effectiveStatus } from '@features/dashboard/status-utils';

interface MetaCell {
  icon: string;
  label: string;
  value: string;
}

interface TaskCardVm {
  id: string;
  index: number;
  name: string;
  status: WeekTask['status'];
  statusLabel: string;
  assignees: string;
  remark?: string;
  dueDate?: string;
  daysDelayed: number;
}

const STATUS_LABEL: Record<WeekTask['status'], string> = {
  'not-started': 'Not Started',
  todo: 'To Do',
  'in-progress': 'In Progress',
  completed: 'Completed',
  hold: 'On Hold',
  delay: 'Delayed',
};

/**
 * Dashboard project-detail popup — mirrors legacy `openEngineerDetail`
 * but keyed by project. Shows header (client · name · status · task
 * summary), meta grid (TL/PM, engineers, weekly target, remarks, …),
 * and the weekly task list. "Open Project" jumps to the projects page
 * for edit.
 */
@Component({
  selector: 'app-project-detail-modal',
  standalone: true,
  imports: [DialogModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [visible]="visible()"
      (visibleChange)="visible.set($event)"
      [modal]="true"
      [style]="{ width: '640px' }"
      [breakpoints]="{ '720px': '95vw' }"
      [draggable]="false"
      [resizable]="false"
      [dismissableMask]="true"
      styleClass="pd-modal"
    >
      <ng-template pTemplate="header">
        @if (project(); as p) {
          <div class="hdr">
            <span class="client-tag">{{ p.client }}</span>
            <div class="titles">
              <div class="proj-name">{{ displayName() }}</div>
              <div class="sub">
                {{ tasks().length }} task{{ tasks().length === 1 ? '' : 's' }} this week
                · {{ doneCount() }} done
                @if (delayCount() > 0) {
                  · <span class="sub-del">{{ delayCount() }} delayed</span>
                }
              </div>
            </div>
            <span class="status-chip">{{ status() || 'Not Set' }}</span>
          </div>
        }
      </ng-template>

      @if (project()) {
        <div class="meta">
          @for (m of meta(); track m.label) {
            <div class="meta-cell">
              <div class="meta-lbl"><i class="pi" [class]="m.icon"></i> {{ m.label }}</div>
              <div class="meta-val">{{ m.value }}</div>
            </div>
          }
        </div>

        @if (tasks().length === 0) {
          <div class="no-tasks">
            <i class="pi pi-inbox"></i>
            No weekly tasks added for this project yet.
          </div>
        } @else {
          <div class="tasks-title">Weekly Tasks</div>
          <div class="tasks">
            @for (t of taskCards(); track t.id) {
              <div class="task-card" [attr.data-status]="t.status">
                <span class="task-num">{{ t.index }}</span>
                <div class="task-body">
                  <div class="task-name">{{ t.name }}</div>
                  <div class="task-meta">
                    <span class="task-status" [attr.data-status]="t.status">{{ t.statusLabel }}</span>
                    @if (t.assignees) {
                      <span class="task-assignee"><i class="pi pi-user"></i> {{ t.assignees }}</span>
                    }
                    @if (t.remark) {
                      <span class="task-remark" [title]="t.remark">
                        <i class="pi pi-file-edit"></i> {{ shortRemark(t.remark) }}
                      </span>
                    }
                    @if (t.daysDelayed > 0) {
                      <span class="task-delay">
                        <i class="pi pi-clock"></i> {{ t.daysDelayed }}d delayed
                      </span>
                    }
                    @if (t.dueDate) {
                      <span class="task-due">Due: {{ t.dueDate }}</span>
                    }
                  </div>
                </div>
              </div>
            }
          </div>
        }
      }

      <ng-template pTemplate="footer">
        <p-button label="Close" severity="secondary" [text]="true" (onClick)="close()" />
        <p-button label="Open Project" icon="pi pi-external-link" (onClick)="openProject()" />
      </ng-template>
    </p-dialog>
  `,
  styleUrl: './project-detail-modal.component.scss',
})
export class ProjectDetailModalComponent {
  private readonly projects = inject(ProjectRepository);
  private readonly users = inject(UserRepository);
  private readonly weekState = inject(WeekStateService);

  readonly visible = model.required<boolean>();
  readonly projectId = input<string | null>(null);
  readonly open = output<string>();

  protected readonly project = computed(() => {
    const id = this.projectId();
    return id ? this.projects.get(id) ?? null : null;
  });

  protected readonly entry = computed(() => {
    const id = this.projectId();
    return id ? this.weekState.entryFor(id) : undefined;
  });

  protected readonly status = computed(() => {
    const p = this.project();
    return p ? effectiveStatus(p, this.entry()) : '';
  });

  protected readonly displayName = computed(() => {
    const p = this.project();
    if (!p) return '';
    return !p.name || p.name === '—' ? `${p.client} Site` : p.name;
  });

  protected readonly tasks = computed<WeekTask[]>(() => this.entry()?.weekTasks ?? []);

  protected readonly doneCount = computed(
    () => this.tasks().filter((t) => t.status === 'completed').length,
  );

  protected readonly delayCount = computed(
    () => this.tasks().filter((t) => t.status === 'delay').length,
  );

  protected readonly meta = computed<MetaCell[]>(() => {
    const p = this.project();
    if (!p) return [];
    const e = this.entry();
    const cells: MetaCell[] = [
      { icon: 'pi-users', label: 'TL / PM', value: p.tls?.join(', ') || 'Not assigned' },
      { icon: 'pi-user', label: 'Engineers', value: p.engineers?.join(', ') || 'Unassigned' },
    ];
    if (e?.weeklyTarget) cells.push({ icon: 'pi-flag', label: 'Weekly Target', value: e.weeklyTarget });
    if (e?.targetDate) cells.push({ icon: 'pi-calendar', label: 'Target Date', value: e.targetDate });
    if (e?.description) cells.push({ icon: 'pi-file-edit', label: 'Description', value: e.description });
    const remarks = e?.remarks ?? p.remarks;
    if (remarks) cells.push({ icon: 'pi-comment', label: 'Remarks', value: remarks });
    return cells;
  });

  protected readonly taskCards = computed<TaskCardVm[]>(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.tasks().map((t, i) => ({
      id: t.id,
      index: i + 1,
      name: t.name || 'Unnamed task',
      status: t.status,
      statusLabel: STATUS_LABEL[t.status] ?? t.status,
      assignees: (t.assignedTo ?? [])
        .map((uid) => this.users.get(uid)?.name ?? '')
        .filter(Boolean)
        .join(', '),
      remark: t.remark,
      dueDate: t.taskDueDate,
      daysDelayed: this.daysDelayed(t, today),
    }));
  });

  private daysDelayed(t: WeekTask, today: Date): number {
    if (!t.taskDueDate) return 0;
    const due = new Date(t.taskDueDate + 'T00:00:00');
    const diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  }

  protected shortRemark(r: string): string {
    return r.length > 40 ? r.slice(0, 40) + '…' : r;
  }

  protected close(): void {
    this.visible.set(false);
  }

  protected openProject(): void {
    const id = this.projectId();
    if (id) this.open.emit(id);
    this.visible.set(false);
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from '@core/services/auth.service';
import { ProjectRepository } from '@core/pouchdb/project.repository';
import { UserRepository } from '@core/pouchdb/user.repository';
import { WeekStateService } from '@core/services/week-state.service';
import { PendingTaskItem, TaskStatus } from '@models/week';
import { IsoDate } from '@models/common';
import {
  addWeeks,
  daysBetween,
  formatWeekRange,
  mondayOf,
  todayIso,
} from '@shared/utils/date.util';

interface Assignee {
  id: string;
  name: string;
  shortName: string;
  initials: string;
  isTL: boolean;
}

interface StatusCfg {
  value: TaskStatus;
  label: string;
  icon: string;
  cls: string;
}

interface StatusCtx {
  icon: string;
  message: string;
  color: string;
}

interface AssigneeOption {
  id: string;
  name: string;
  initials: string;
  role: 'tl' | 'user';
  isAssigned: boolean;
}

interface PendingRow {
  item: PendingTaskItem;
  rowKey: string;
  rank: number;
  delayDays: number;
  projectClient: string;
  projectName: string;
  assignees: Assignee[];
  assigneeOptions: AssigneeOption[];
  originWeekLabel: string;
  status: StatusCfg;
  statusCtx: StatusCtx;
}

const STATUS_CFG: readonly StatusCfg[] = [
  { value: 'not-started', label: 'Not Started', icon: 'pi-circle', cls: 'p-ns' },
  { value: 'todo', label: 'To Do', icon: 'pi-play', cls: 'p-todo' },
  { value: 'in-progress', label: 'In Progress', icon: 'pi-spinner', cls: 'p-ip' },
  { value: 'completed', label: 'Completed', icon: 'pi-check', cls: 'p-done' },
  { value: 'hold', label: 'On Hold', icon: 'pi-pause', cls: 'p-hold' },
  { value: 'delay', label: 'Delay', icon: 'pi-exclamation-triangle', cls: 'p-del' },
];

const STATUS_CTX: Record<TaskStatus, StatusCtx> = {
  'in-progress': {
    icon: 'pi-spinner',
    message: 'Work was actively in progress — will carry as In Progress.',
    color: '#1e40af',
  },
  hold: {
    icon: 'pi-pause',
    message: 'Work was on hold — will carry as On Hold. Update if the blocker is resolved.',
    color: '#92400e',
  },
  delay: {
    icon: 'pi-exclamation-triangle',
    message: 'Task was already delayed — update status before moving if work has started.',
    color: '#991b1b',
  },
  'not-started': {
    icon: 'pi-circle',
    message: 'Not yet started — will move as To Do.',
    color: '#6b7280',
  },
  todo: {
    icon: 'pi-circle',
    message: 'Not yet started — will move as To Do.',
    color: '#6b7280',
  },
  completed: {
    icon: 'pi-check',
    message: 'Marked completed — will reset to To Do when moved.',
    color: '#059669',
  },
};

/**
 * Priority queue of pending tasks from prior weeks. Sorted by delay
 * days (most delayed first). PMs/TLs can reassign, set status, and
 * move each task into the current week, next week, or an arbitrary
 * date. Mirrors the legacy "Pending Tasks — Priority Queue" card.
 */
@Component({
  selector: 'app-pending-tasks-bar',
  standalone: true,
  imports: [FormsModule, ButtonModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pending-tasks-bar.component.html',
  styleUrl: './pending-tasks-bar.component.scss',
})
export class PendingTasksBarComponent {
  private readonly state = inject(WeekStateService);
  private readonly projects = inject(ProjectRepository);
  private readonly users = inject(UserRepository);
  private readonly auth = inject(AuthService);

  /** When true, the card always renders even with 0 pending tasks (shows
   * an empty state instead of hiding entirely). Dashboard mounts with
   * this on so the section is discoverable; Projects page leaves it
   * off to keep the header quiet when nothing is pending. */
  readonly alwaysShow = input(false);

  private readonly _items = signal<PendingTaskItem[]>([]);
  private readonly _loading = signal(false);
  private readonly _openPickerRow = signal<string | null>(null);
  private readonly _customDates = signal<Record<string, IsoDate>>({});

  protected readonly collapsed = signal(false);
  protected readonly loading = this._loading.asReadonly();

  protected readonly canCarry = computed(() => {
    const r = this.auth.role();
    return r === 'pm' || r === 'tl';
  });

  protected readonly statusOptions = STATUS_CFG;

  protected readonly rows = computed<PendingRow[]>(() => {
    const items = this._items();
    const today = todayIso();
    const assigneePool = this.users.sorted().filter((u) => u.role !== 'pm');

    const rows = items.map<PendingRow>((item) => {
      const p = this.projects.get(item.projectId);
      const delayDays = Math.max(
        0,
        daysBetween(item.task.originalWeek ?? item.task.carriedWeek ?? item.week, today),
      );
      const assigneeIds = new Set(item.task.assignedTo ?? []);
      const assignees: Assignee[] = (item.task.assignedTo ?? [])
        .map((uid) => this.users.get(uid))
        .filter((u): u is NonNullable<typeof u> => !!u)
        .map((u) => ({
          id: u._id,
          name: u.name,
          shortName: u.name.split(' ').slice(0, 2).join(' '),
          initials: initialsOf(u.name),
          isTL: u.role === 'tl',
        }));

      const assigneeOptions: AssigneeOption[] = assigneePool.map((u) => ({
        id: u._id,
        name: u.name,
        initials: initialsOf(u.name),
        role: u.role as 'tl' | 'user',
        isAssigned: assigneeIds.has(u._id),
      }));

      const status = STATUS_CFG.find((c) => c.value === item.task.status) ?? STATUS_CFG[0];

      return {
        item,
        rowKey: `${item.week}::${item.projectId}::${item.task.id}`,
        rank: 0,
        delayDays,
        projectClient: p?.client ?? 'Unknown',
        projectName: p?.name && p.name !== '—' ? p.name : (p?.client ?? '') + ' Site',
        assignees,
        assigneeOptions,
        originWeekLabel: formatWeekRange(item.task.originalWeek ?? item.week),
        status,
        statusCtx: STATUS_CTX[item.task.status] ?? STATUS_CTX['not-started'],
      };
    });

    rows.sort((a, b) => b.delayDays - a.delayDays);
    rows.forEach((r, i) => (r.rank = i + 1));
    return rows;
  });

  protected readonly total = computed(() => this._items().length);
  protected readonly currentWeek = this.state.loadedWeek;
  protected readonly nextWeekIso = computed<IsoDate>(() => addWeeks(this.currentWeek(), 1));
  protected readonly openPickerRow = this._openPickerRow.asReadonly();

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

  async moveToCustomDate(row: PendingRow): Promise<void> {
    const raw = this._customDates()[row.rowKey];
    if (!raw) return;
    const toWeek = mondayOf(raw);
    await this.move(row, toWeek);
    // Clear the input so a second move on the same row starts fresh.
    const next = { ...this._customDates() };
    delete next[row.rowKey];
    this._customDates.set(next);
  }

  setCustomDate(row: PendingRow, value: string): void {
    if (!value) return;
    this._customDates.set({ ...this._customDates(), [row.rowKey]: value as IsoDate });
  }

  getCustomDate(row: PendingRow): IsoDate | '' {
    return this._customDates()[row.rowKey] ?? '';
  }

  async moveAll(toWeek: IsoDate): Promise<void> {
    for (const row of [...this.rows()]) {
      await this.state.carryTask(row.item.week, row.item.projectId, row.item.task.id, toWeek);
    }
    await this.refresh();
  }

  moveAllToCurrent(): Promise<void> {
    return this.moveAll(this.currentWeek());
  }

  moveAllToNext(): Promise<void> {
    return this.moveAll(this.nextWeekIso());
  }

  async changeStatus(row: PendingRow, status: TaskStatus): Promise<void> {
    if (status === row.item.task.status) return;
    await this.state.patchPendingTask(row.item.week, row.item.projectId, row.item.task.id, {
      status,
    });
    this.patchItemInPlace(row, { status });
  }

  onStatusPicked(row: PendingRow, event: Event): void {
    const value = (event.target as HTMLSelectElement).value as TaskStatus;
    void this.changeStatus(row, value);
  }

  togglePicker(row: PendingRow): void {
    this._openPickerRow.update((cur) => (cur === row.rowKey ? null : row.rowKey));
  }

  closePicker(): void {
    this._openPickerRow.set(null);
  }

  async toggleAssignee(row: PendingRow, userId: string): Promise<void> {
    const current = row.item.task.assignedTo ?? [];
    const next = current.includes(userId)
      ? current.filter((u) => u !== userId)
      : [...current, userId];
    await this.state.patchPendingTask(row.item.week, row.item.projectId, row.item.task.id, {
      assignedTo: next,
    });
    this.patchItemInPlace(row, { assignedTo: next });
  }

  toggle(): void {
    this.collapsed.update((c) => !c);
  }

  /**
   * Mutate the local `_items` snapshot so the row re-renders immediately.
   * Avoids a full `refresh()` (and its network round-trip) for edits that
   * don't change which rows appear.
   */
  private patchItemInPlace(
    row: PendingRow,
    patch: Partial<{ status: TaskStatus; assignedTo: string[] }>,
  ): void {
    this._items.update((list) =>
      list.map((it) =>
        it.week === row.item.week &&
        it.projectId === row.item.projectId &&
        it.task.id === row.item.task.id
          ? { ...it, task: { ...it.task, ...patch } }
          : it,
      ),
    );
  }
}

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

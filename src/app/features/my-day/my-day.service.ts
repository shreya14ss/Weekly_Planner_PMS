import { Injectable, Signal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import { AuthService } from '@core/services/auth.service';
import { WeekStateService } from '@core/services/week-state.service';
import { DatabaseService } from '@core/pouchdb/database.service';
import { WeekRepository } from '@core/pouchdb/week.repository';
import { idOf } from '@core/pouchdb/id-utils';
import { ProjectRepository } from '@core/pouchdb/project.repository';
import { ReminderRepository } from '@core/pouchdb/reminder.repository';
import { MeetingRepository } from '@core/pouchdb/meeting.repository';
import { TodoRepository } from '@core/pouchdb/todo.repository';
import { ReminderDoc } from '@models/reminder';
import { MeetingDoc } from '@models/meeting';
import { TodoDoc } from '@models/todo';
import { ProjectWeekEntry, WeekDoc, WeekTask } from '@models/week';
import { currentWeekMonday, todayIso } from '@shared/utils/date.util';

export interface ProjectTaskForDay {
  projectId: string;
  projectName: string;
  client: string;
  task: WeekTask;
}

/**
 * Per-user "My Day" aggregations. Everything is scoped to the
 * currently-authenticated user — this service never leaks other
 * users' reminders/meetings/todos.
 */
@Injectable({ providedIn: 'root' })
export class MyDayService {
  private readonly auth = inject(AuthService);
  private readonly weekState = inject(WeekStateService);
  private readonly db = inject(DatabaseService);
  private readonly weekRepo = inject(WeekRepository);
  private readonly projects = inject(ProjectRepository);
  readonly reminders = inject(ReminderRepository);
  readonly meetings = inject(MeetingRepository);
  readonly todos = inject(TodoRepository);

  private readonly userId = computed(() => this.auth.currentUser()?.id ?? '');

  /** Live date — recomputed only when a dependency changes, not on a timer.
   *  For a single-session dashboard that's good enough; a long-running tab
   *  across midnight is an acceptable edge case. */
  private readonly today = computed(() => todayIso());
  private readonly currentWeek = computed(() => currentWeekMonday());

  /** Stored entries of the current calendar week, kept fresh via the
   *  change feed. Used when the header is browsing a different week. */
  private readonly storedCurrentWeek = signal<Record<string, ProjectWeekEntry>>({});

  /** Project entries for *this* week regardless of which week the header
   *  has loaded. Prefers live WeekState when it is on the current week so
   *  edits on the Projects page show up here immediately. */
  private readonly currentWeekEntries = computed(() =>
    this.weekState.loadedWeek() === this.currentWeek()
      ? this.weekState.entries()
      : this.storedCurrentWeek(),
  );

  constructor() {
    void this.weekRepo
      .load(this.currentWeek())
      .then((doc) => this.storedCurrentWeek.set(doc?.entries ?? {}))
      .catch(() => undefined);

    this.db
      .changes()
      .pipe(
        filter((c) => c.id === idOf('week', this.currentWeek())),
        takeUntilDestroyed(),
      )
      .subscribe((c) =>
        this.storedCurrentWeek.set(c.deleted ? {} : ((c.doc as WeekDoc | undefined)?.entries ?? {})),
      );
  }

  // ─── Meetings ────────────────────────────────────────────────────────
  /** Today's upcoming + in-progress meetings. Meetings whose end time
   *  has already passed move into `meetingsPastToday` so they only
   *  appear in Caught Up — the two lists are mutually exclusive. */
  readonly meetingsToday: Signal<MeetingDoc[]> = computed(() => {
    const uid = this.userId();
    const d = this.today();
    const nowMs = Date.now();
    return this.meetings
      .all()
      .filter(
        (m) =>
          m.userId === uid &&
          m.dateIso === d &&
          endOfMeeting(m) > nowMs,
      )
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  });

  readonly meetingsUpcoming: Signal<MeetingDoc[]> = computed(() => {
    const uid = this.userId();
    const d = this.today();
    return this.meetings
      .all()
      .filter((m) => m.userId === uid && m.dateIso > d)
      .sort(
        (a, b) =>
          a.dateIso.localeCompare(b.dateIso) || a.startTime.localeCompare(b.startTime),
      )
      .slice(0, 5);
  });

  // ─── Reminders ───────────────────────────────────────────────────────
  readonly remindersToday: Signal<ReminderDoc[]> = computed(() => {
    const uid = this.userId();
    const d = this.today();
    return this.reminders
      .all()
      .filter((r) => r.userId === uid && !r.done && r.dueAt === d)
      .sort((a, b) => sortByTimeThenCreated(a, b));
  });

  readonly remindersOverdue: Signal<ReminderDoc[]> = computed(() => {
    const uid = this.userId();
    const d = this.today();
    return this.reminders
      .all()
      .filter((r) => r.userId === uid && !r.done && r.dueAt < d)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  });

  readonly remindersUpcoming: Signal<ReminderDoc[]> = computed(() => {
    const uid = this.userId();
    const d = this.today();
    return this.reminders
      .all()
      .filter((r) => r.userId === uid && !r.done && r.dueAt > d)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
      .slice(0, 5);
  });

  // ─── Personal todos ──────────────────────────────────────────────────
  readonly todosToday: Signal<TodoDoc[]> = computed(() => {
    const uid = this.userId();
    const d = this.today();
    return this.todos
      .all()
      .filter((t) => t.userId === uid && !t.done && t.dueAt === d)
      .sort((a, b) => priorityOrder(b) - priorityOrder(a));
  });

  readonly todosOverdue: Signal<TodoDoc[]> = computed(() => {
    const uid = this.userId();
    const d = this.today();
    return this.todos
      .all()
      .filter((t) => t.userId === uid && !t.done && !!t.dueAt && t.dueAt < d)
      .sort((a, b) => (a.dueAt ?? '').localeCompare(b.dueAt ?? ''));
  });

  readonly todosInbox: Signal<TodoDoc[]> = computed(() => {
    const uid = this.userId();
    return this.todos
      .all()
      .filter((t) => t.userId === uid && !t.done && !t.dueAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  });

  // ─── Caught up today (completed items + past meetings) ──────────────
  readonly remindersDoneToday: Signal<ReminderDoc[]> = computed(() => {
    const uid = this.userId();
    const d = this.today();
    return this.reminders
      .all()
      .filter((r) => r.userId === uid && r.done && (r.completedAt ?? '').startsWith(d))
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  });

  readonly todosDoneToday: Signal<TodoDoc[]> = computed(() => {
    const uid = this.userId();
    const d = this.today();
    return this.todos
      .all()
      .filter((t) => t.userId === uid && t.done && (t.completedAt ?? '').startsWith(d))
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  });

  readonly meetingsPastToday: Signal<MeetingDoc[]> = computed(() => {
    const uid = this.userId();
    const d = this.today();
    const now = new Date();
    const nowMs = now.getTime();
    return this.meetings
      .all()
      .filter((m) => {
        if (m.userId !== uid || m.dateIso !== d) return false;
        const endMs = endOfMeeting(m);
        return endMs <= nowMs;
      })
      .sort((a, b) => b.startTime.localeCompare(a.startTime));
  });

  readonly caughtUpCount: Signal<number> = computed(
    () =>
      this.remindersDoneToday().length +
      this.todosDoneToday().length +
      this.meetingsPastToday().length,
  );

  // ─── Assigned project tasks ──────────────────────────────────────────
  readonly projectTasksToday: Signal<ProjectTaskForDay[]> = computed(() =>
    this.collectProjectTasks((t) => !!t.taskDueDate && t.taskDueDate === this.today()),
  );

  readonly projectTasksOverdue: Signal<ProjectTaskForDay[]> = computed(() =>
    this.collectProjectTasks((t) => !!t.taskDueDate && t.taskDueDate < this.today()),
  );

  /** Rest of this week's assigned tasks: due later or with no due date. */
  readonly projectTasksThisWeek: Signal<ProjectTaskForDay[]> = computed(() =>
    this.collectProjectTasks((t) => !t.taskDueDate || t.taskDueDate > this.today()),
  );

  /** Mark an assigned project task completed from My Day. */
  async completeProjectTask(row: ProjectTaskForDay): Promise<void> {
    const week = this.currentWeek();
    if (this.weekState.loadedWeek() === week) {
      this.weekState.setTaskStatus(row.projectId, row.task.id, 'completed');
      await this.weekState.saveProject(row.projectId, row.projectName);
      return;
    }
    await this.weekState.patchPendingTask(week, row.projectId, row.task.id, {
      status: 'completed',
      _completedBy: this.auth.currentUser()?.name ?? 'Unknown',
      _completedAt: new Date().toISOString(),
    });
  }

  private collectProjectTasks(
    predicate: (t: WeekTask) => boolean,
  ): ProjectTaskForDay[] {
    const uid = this.userId();
    const entries = this.currentWeekEntries();
    const out: ProjectTaskForDay[] = [];

    for (const [projectId, entry] of Object.entries(entries)) {
      const project = this.projects.get(projectId);
      if (!project) continue;
      for (const t of entry.weekTasks ?? []) {
        if (t.status === 'completed') continue;
        if (!(t.assignedTo ?? []).includes(uid)) continue;
        if (!predicate(t)) continue;
        out.push({
          projectId,
          projectName: project.name === '—' || !project.name ? `${project.client} Site` : project.name,
          client: project.client,
          task: t,
        });
      }
    }

    return out.sort((a, b) =>
      (a.task.taskDueDate ?? '').localeCompare(b.task.taskDueDate ?? ''),
    );
  }
}

function endOfMeeting(m: MeetingDoc): number {
  const [hh, mm] = m.startTime.split(':').map(Number);
  const [y, mo, d] = m.dateIso.split('-').map(Number);
  const start = new Date(y, (mo ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
  return start.getTime() + (m.durationMin || 0) * 60_000;
}

function sortByTimeThenCreated(a: ReminderDoc, b: ReminderDoc): number {
  // Timed reminders sort first (ascending); whole-day ones sink to the bottom.
  const aT = a.dueTime ?? '~';
  const bT = b.dueTime ?? '~';
  return aT.localeCompare(bT) || a.createdAt.localeCompare(b.createdAt);
}

function priorityOrder(t: TodoDoc): number {
  switch (t.priority) {
    case 'high':
      return 2;
    case 'low':
      return 0;
    default:
      return 1;
  }
}

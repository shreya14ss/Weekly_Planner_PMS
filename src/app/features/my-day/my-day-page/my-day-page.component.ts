import {
  ChangeDetectionStrategy,
  Component,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { SelectModule } from 'primeng/select';
import { Popover, PopoverModule } from 'primeng/popover';

import { AuthService } from '@core/services/auth.service';
import { UserRepository } from '@core/pouchdb/user.repository';
import { MyDayService, ProjectTaskForDay } from '@features/my-day/my-day.service';
import { MyDayNotificationService } from '@features/my-day/my-day-notification.service';
import {
  RECURRENCE_OPTIONS,
  RecurrencePreset,
  recurrenceLabel,
} from '@features/my-day/recurrence';
import { ReminderDoc } from '@models/reminder';
import { MeetingDoc } from '@models/meeting';
import { TodoDoc } from '@models/todo';
import { TaskStatus } from '@models/week';
import { addDays, format, parseISO } from 'date-fns';
import { todayIso, toIsoDate } from '@shared/utils/date.util';

type QuickForm = 'reminder' | 'todo' | 'meeting' | null;

type EditTarget =
  | { kind: 'reminder'; id: string }
  | { kind: 'todo'; id: string }
  | { kind: 'meeting'; id: string }
  | null;

type SnoozeTarget =
  | { kind: 'reminder'; doc: ReminderDoc }
  | { kind: 'todo'; doc: TodoDoc }
  | null;

interface ReminderDraft {
  text: string;
  dueAt: string;
  dueTime: string;
  recurrence: RecurrencePreset;
  /** User id this reminder is being created for. Empty = self. */
  assignTo: string;
}

interface TodoDraft {
  text: string;
  dueAt: string;
  priority: TodoDoc['priority'];
  recurrence: RecurrencePreset;
  /** User id this todo is being created for. Empty = self. */
  assignTo: string;
}

interface MeetingDraft {
  title: string;
  dateIso: string;
  startTime: string;
  durationMin: number;
  location: string;
}

const PRIORITY_OPTIONS: { label: string; value: TodoDoc['priority'] }[] = [
  { label: 'Low',    value: 'low' },
  { label: 'Normal', value: 'normal' },
  { label: 'High',   value: 'high' },
];

const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  'not-started': 'Not started',
  todo:          'To do',
  'in-progress': 'In progress',
  completed:     'Completed',
  hold:          'On hold',
  delay:         'Delayed',
};

@Component({
  selector: 'app-my-day-page',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputTextModule, SelectModule, PopoverModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './my-day-page.component.html',
  styleUrl: './my-day-page.component.scss',
})
export class MyDayPageComponent {
  protected readonly my = inject(MyDayService);
  protected readonly notifications = inject(MyDayNotificationService);
  private readonly auth = inject(AuthService);
  private readonly users = inject(UserRepository);
  private readonly router = inject(Router);

  /** PM / TL can delegate; a regular user can only create for themselves. */
  protected readonly canDelegate = computed(
    () => this.auth.isPM() || this.auth.isTL(),
  );

  /** Dropdown options for the "Assign to" picker. "Myself" is a sentinel
   *  empty string so no delegation metadata is written for the self case. */
  protected readonly assigneeOptions = computed(() => {
    const meId = this.auth.currentUser()?.id ?? '';
    return [
      { label: 'Myself', value: '' },
      ...this.users
        .all()
        .filter((u) => u._id !== meId)
        .map((u) => ({ label: u.name, value: u._id })),
    ];
  });

  /** Look up a user's display name — used by the "From @X" badge on
   *  delegated rows. Falls back to a muted "someone" if we don't have
   *  that user doc locally (deleted, or hasn't synced yet). */
  protected assignedByName(userId: string | undefined): string {
    if (!userId) return '';
    return this.users.get(userId)?.name ?? 'someone';
  }

  protected readonly priorityOptions = PRIORITY_OPTIONS;
  protected readonly recurrenceOptions = RECURRENCE_OPTIONS;
  protected readonly recurrenceLabel = recurrenceLabel;

  protected readonly userName = computed(
    () => this.auth.currentUser()?.name ?? 'there',
  );

  protected readonly greeting = computed(() => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  });

  protected readonly todayLabel = computed(() =>
    format(new Date(), 'EEEE, d MMMM yyyy'),
  );

  protected readonly dueTodayCount = computed(
    () =>
      this.my.projectTasksToday().length +
      this.my.remindersToday().length +
      this.my.todosToday().length,
  );

  protected readonly overdueCount = computed(
    () =>
      this.my.projectTasksOverdue().length +
      this.my.remindersOverdue().length +
      this.my.todosOverdue().length,
  );

  // ─── Quick-add form state ──────────────────────────────────────────
  protected readonly activeForm = signal<QuickForm>(null);
  protected readonly overdueExpanded = signal<boolean>(false);
  protected readonly inboxExpanded = signal<boolean>(true);
  protected readonly projectTasksExpanded = signal<boolean>(true);
  protected readonly caughtUpExpanded = signal<boolean>(false);

  // Drafts are plain mutable objects — they're only read by the form
  // bindings via two-way [(ngModel)], never by any signal consumer. Using
  // signals here (plus the ngModelChange+spread pattern) forced the entire
  // template to re-run on every keystroke, which hung the page.
  protected reminderDraft: ReminderDraft = this.freshReminderDraft();
  protected todoDraft: TodoDraft = this.freshTodoDraft();
  protected meetingDraft: MeetingDraft = this.freshMeetingDraft();

  // ─── Edit state ────────────────────────────────────────────────────
  protected readonly editing = signal<EditTarget>(null);
  protected editReminderDraft: ReminderDraft = this.freshReminderDraft();
  protected editTodoDraft: TodoDraft = this.freshTodoDraft();
  protected editMeetingDraft: MeetingDraft = this.freshMeetingDraft();

  // ─── Snooze menu state ─────────────────────────────────────────────
  @ViewChild('snoozeMenu') private snoozeMenu?: Popover;
  protected readonly snoozeTarget = signal<SnoozeTarget>(null);

  protected isEditingReminder(id: string): boolean {
    const e = this.editing();
    return e?.kind === 'reminder' && e.id === id;
  }
  protected isEditingTodo(id: string): boolean {
    const e = this.editing();
    return e?.kind === 'todo' && e.id === id;
  }
  protected isEditingMeeting(id: string): boolean {
    const e = this.editing();
    return e?.kind === 'meeting' && e.id === id;
  }

  enableNotifications(): void {
    void this.notifications.requestPermission();
  }

  toggleForm(form: QuickForm): void {
    this.activeForm.set(this.activeForm() === form ? null : form);
  }

  toggleOverdue(): void { this.overdueExpanded.update((v) => !v); }
  toggleInbox(): void { this.inboxExpanded.update((v) => !v); }
  toggleProjectTasks(): void { this.projectTasksExpanded.update((v) => !v); }
  toggleCaughtUp(): void { this.caughtUpExpanded.update((v) => !v); }
  toggleSound(): void {
    this.notifications.setSoundEnabled(!this.notifications.soundEnabled());
  }

  // ─── Edit begin / cancel / save ────────────────────────────────────
  beginEditReminder(r: ReminderDoc): void {
    this.editReminderDraft = {
      text: r.text,
      dueAt: r.dueAt,
      dueTime: r.dueTime ?? '',
      recurrence: r.recurrence ?? 'none',
      // Edit doesn't change ownership — once delegated, the recipient
      // owns the item. The assignTo field exists on the draft just to
      // satisfy the type; it isn't surfaced in the edit form.
      assignTo: '',
    };
    this.editing.set({ kind: 'reminder', id: r._id });
  }

  beginEditTodo(t: TodoDoc): void {
    this.editTodoDraft = {
      text: t.text,
      dueAt: t.dueAt ?? '',
      priority: t.priority ?? 'normal',
      recurrence: t.recurrence ?? 'none',
      assignTo: '',
    };
    this.editing.set({ kind: 'todo', id: t._id });
  }

  beginEditMeeting(m: MeetingDoc): void {
    this.editMeetingDraft = {
      title: m.title,
      dateIso: m.dateIso,
      startTime: m.startTime,
      durationMin: m.durationMin,
      location: m.location ?? '',
    };
    this.editing.set({ kind: 'meeting', id: m._id });
  }

  cancelEdit(): void { this.editing.set(null); }

  async saveEditReminder(r: ReminderDoc): Promise<void> {
    const d = this.editReminderDraft;
    const text = d.text.trim();
    if (!text) return;
    await this.my.reminders.update(r, {
      text,
      dueAt: d.dueAt || r.dueAt,
      dueTime: d.dueTime || undefined,
      recurrence: d.recurrence === 'none' ? undefined : d.recurrence,
    });
    this.editing.set(null);
  }

  async saveEditTodo(t: TodoDoc): Promise<void> {
    const d = this.editTodoDraft;
    const text = d.text.trim();
    if (!text) return;
    await this.my.todos.update(t, {
      text,
      dueAt: d.dueAt || undefined,
      priority: d.priority ?? 'normal',
      recurrence: d.recurrence === 'none' ? undefined : d.recurrence,
    });
    this.editing.set(null);
  }

  async saveEditMeeting(m: MeetingDoc): Promise<void> {
    const d = this.editMeetingDraft;
    const title = d.title.trim();
    if (!title) return;
    await this.my.meetings.update(m, {
      title,
      dateIso: d.dateIso || m.dateIso,
      startTime: d.startTime || m.startTime,
      durationMin: Math.max(5, Number(d.durationMin) || m.durationMin),
      location: d.location.trim() || undefined,
    });
    this.editing.set(null);
  }

  // ─── Un-complete (restore a caught-up item) ────────────────────────
  reopenReminder(r: ReminderDoc): void {
    void this.my.reminders.update(r, { done: false, completedAt: undefined });
  }
  reopenTodo(t: TodoDoc): void {
    void this.my.todos.update(t, { done: false, completedAt: undefined });
  }

  // ─── Create actions ────────────────────────────────────────────────
  async saveReminder(): Promise<void> {
    const d = this.reminderDraft;
    const text = d.text.trim();
    if (!text) return;
    const meId = this.auth.currentUser()?.id ?? '';
    // Delegation: when assignTo picks someone other than self, the
    // reminder's owner becomes the recipient and `assignedBy` records me.
    const delegating = this.canDelegate() && !!d.assignTo && d.assignTo !== meId;
    const ownerId = delegating ? d.assignTo : meId;
    await this.my.reminders.create({
      userId: ownerId,
      text,
      dueAt: d.dueAt || todayIso(),
      dueTime: d.dueTime || undefined,
      done: false,
      recurrence: d.recurrence === 'none' ? undefined : d.recurrence,
      assignedBy: delegating ? meId : undefined,
    });
    this.reminderDraft = this.freshReminderDraft();
    this.activeForm.set(null);
  }

  async saveTodo(): Promise<void> {
    const d = this.todoDraft;
    const text = d.text.trim();
    if (!text) return;
    const meId = this.auth.currentUser()?.id ?? '';
    const delegating = this.canDelegate() && !!d.assignTo && d.assignTo !== meId;
    const ownerId = delegating ? d.assignTo : meId;
    await this.my.todos.create({
      userId: ownerId,
      text,
      dueAt: d.dueAt || undefined,
      priority: d.priority ?? 'normal',
      done: false,
      recurrence: d.recurrence === 'none' ? undefined : d.recurrence,
      assignedBy: delegating ? meId : undefined,
    });
    this.todoDraft = this.freshTodoDraft();
    this.activeForm.set(null);
  }

  async saveMeeting(): Promise<void> {
    const d = this.meetingDraft;
    const title = d.title.trim();
    if (!title) return;
    await this.my.meetings.create({
      userId: this.auth.currentUser()?.id ?? '',
      title,
      dateIso: d.dateIso || todayIso(),
      startTime: d.startTime || '09:00',
      durationMin: Math.max(5, Number(d.durationMin) || 30),
      location: d.location.trim() || undefined,
    });
    this.meetingDraft = this.freshMeetingDraft();
    this.activeForm.set(null);
  }

  // ─── Complete (recurring-aware) ────────────────────────────────────
  completeReminder(r: ReminderDoc): void {
    void this.my.reminders.completeInstance(r);
  }
  completeTodo(t: TodoDoc): void {
    void this.my.todos.completeInstance(t);
  }

  // ─── Snooze menu ───────────────────────────────────────────────────
  openSnoozeForReminder(event: Event, r: ReminderDoc): void {
    this.snoozeTarget.set({ kind: 'reminder', doc: r });
    this.snoozeMenu?.toggle(event);
  }

  openSnoozeForTodo(event: Event, t: TodoDoc): void {
    this.snoozeTarget.set({ kind: 'todo', doc: t });
    this.snoozeMenu?.toggle(event);
  }

  snoozeLaterToday(): void {
    const target = this.snoozeTarget();
    if (target?.kind !== 'reminder') return;
    // Shift to today + 2h from now, rounded to nearest 15m. If that
    // crosses midnight, fall through to "Tomorrow morning".
    const twoHoursOut = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const dayShift = twoHoursOut.toDateString() !== new Date().toDateString();
    if (dayShift) {
      this.applyReminderSnooze(target.doc, this.tomorrowIso(), '09:00');
      return;
    }
    const minutes = Math.ceil(twoHoursOut.getMinutes() / 15) * 15;
    twoHoursOut.setMinutes(minutes === 60 ? 0 : minutes, 0, 0);
    if (minutes === 60) twoHoursOut.setHours(twoHoursOut.getHours() + 1);
    const hh = String(twoHoursOut.getHours()).padStart(2, '0');
    const mm = String(twoHoursOut.getMinutes()).padStart(2, '0');
    this.applyReminderSnooze(target.doc, todayIso(), `${hh}:${mm}`);
  }

  snoozeThisEvening(): void {
    const target = this.snoozeTarget();
    if (target?.kind !== 'reminder') return;
    this.applyReminderSnooze(target.doc, todayIso(), '18:00');
  }

  snoozeTomorrow(): void {
    const target = this.snoozeTarget();
    if (!target) return;
    const date = this.tomorrowIso();
    if (target.kind === 'reminder') {
      // Preserve the original time if set, otherwise default to 9am.
      this.applyReminderSnooze(target.doc, date, target.doc.dueTime || '09:00');
    } else {
      this.applyTodoSnooze(target.doc, date);
    }
  }

  snoozeThisWeekend(): void {
    const target = this.snoozeTarget();
    if (!target) return;
    const date = this.nextDayOfWeek(6); // Saturday
    if (target.kind === 'reminder') {
      this.applyReminderSnooze(target.doc, date, target.doc.dueTime || '10:00');
    } else {
      this.applyTodoSnooze(target.doc, date);
    }
  }

  snoozeNextWeek(): void {
    const target = this.snoozeTarget();
    if (!target) return;
    const date = this.nextDayOfWeek(1); // Monday
    if (target.kind === 'reminder') {
      this.applyReminderSnooze(target.doc, date, target.doc.dueTime || '09:00');
    } else {
      this.applyTodoSnooze(target.doc, date);
    }
  }

  private applyReminderSnooze(r: ReminderDoc, dueAt: string, dueTime: string): void {
    void this.my.reminders.update(r, { dueAt, dueTime });
    this.snoozeMenu?.hide();
    this.snoozeTarget.set(null);
  }

  private applyTodoSnooze(t: TodoDoc, dueAt: string): void {
    void this.my.todos.update(t, { dueAt });
    this.snoozeMenu?.hide();
    this.snoozeTarget.set(null);
  }

  private tomorrowIso(): string {
    return toIsoDate(addDays(new Date(), 1));
  }

  /** Next future date whose day-of-week matches `target` (0=Sun, 6=Sat).
   *  Never returns today — "next Monday" on a Monday means 7 days out. */
  private nextDayOfWeek(target: number): string {
    const now = new Date();
    const day = now.getDay();
    const diff = ((target - day + 7) % 7) || 7;
    return toIsoDate(addDays(now, diff));
  }

  // ─── Delete ────────────────────────────────────────────────────────
  deleteReminder(r: ReminderDoc): void { void this.my.reminders.remove(r); }
  deleteTodo(t: TodoDoc): void { void this.my.todos.remove(t); }
  deleteMeeting(m: MeetingDoc): void { void this.my.meetings.remove(m); }

  completeProjectTask(row: ProjectTaskForDay): void {
    void this.my.completeProjectTask(row);
  }

  taskStatusLabel(row: ProjectTaskForDay): string {
    return TASK_STATUS_LABELS[row.task.status] ?? row.task.status;
  }

  openProject(row: ProjectTaskForDay): void {
    this.router.navigate(['/app/projects'], { fragment: row.projectId });
  }

  // ─── View helpers ──────────────────────────────────────────────────
  formatMeetingTime(m: MeetingDoc): string {
    const [hh, mm] = m.startTime.split(':').map(Number);
    const start = new Date();
    start.setHours(hh, mm, 0, 0);
    const end = new Date(start.getTime() + m.durationMin * 60_000);
    return `${format(start, 'HH:mm')} – ${format(end, 'HH:mm')}`;
  }

  formatDate(iso: string | undefined): string {
    if (!iso) return '';
    return format(parseISO(iso), 'd MMM');
  }

  daysOverdueLabel(iso: string | undefined): string {
    if (!iso) return '';
    const diff = Math.max(0, Math.floor((Date.now() - parseISO(iso).getTime()) / 86400000));
    return diff === 0 ? 'Today' : `${diff}d late`;
  }

  // ─── Fresh drafts ──────────────────────────────────────────────────
  private freshReminderDraft(): ReminderDraft {
    return { text: '', dueAt: todayIso(), dueTime: '', recurrence: 'none', assignTo: '' };
  }
  private freshTodoDraft(): TodoDraft {
    return { text: '', dueAt: todayIso(), priority: 'normal', recurrence: 'none', assignTo: '' };
  }
  private freshMeetingDraft(): MeetingDraft {
    return {
      title: '',
      dateIso: todayIso(),
      startTime: '09:00',
      durationMin: 30,
      location: '',
    };
  }
}

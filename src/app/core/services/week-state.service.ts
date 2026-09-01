import { Injectable, computed, inject, signal } from '@angular/core';

import { IsoDate } from '@models/common';
import { ProjectWeekEntry, TaskStatus, WeekTask } from '@models/week';
import { WeekRepository } from '@core/pouchdb/week.repository';
import { AuditRepository } from '@core/pouchdb/audit.repository';
import { AuthService } from '@core/services/auth.service';
import { shortId } from '@core/pouchdb/id-utils';
import { addWeeks, currentWeekMonday, mondayOf } from '@shared/utils/date.util';

const LS_LAST_WEEK = 'wpr_last_week';

/**
 * App-global state for the currently loaded week.
 *
 * Owns the in-memory `entries` map (keyed by project id) and per-project
 * dirty tracking so the UI can offer a save/discard flow instead of
 * autosaving every keystroke. Autosave was the source of the original
 * app's data-loss bug (see §7 of the architecture doc) — explicit save
 * is safer AND better UX.
 */
@Injectable({ providedIn: 'root' })
export class WeekStateService {
  private readonly weekRepo = inject(WeekRepository);
  private readonly audit = inject(AuditRepository);
  private readonly auth = inject(AuthService);

  private readonly _loadedWeek = signal<IsoDate>(this.restoreLastWeek());
  private readonly _entries = signal<Record<string, ProjectWeekEntry>>({});
  private readonly _dirty = signal<ReadonlySet<string>>(new Set());
  private readonly _loading = signal(false);

  /** Snapshot of last-saved entries, used to power "Discard" per project. */
  private snapshot: Record<string, ProjectWeekEntry> = {};

  readonly loadedWeek = this._loadedWeek.asReadonly();
  readonly entries = this._entries.asReadonly();
  readonly dirty = this._dirty.asReadonly();
  readonly loading = this._loading.asReadonly();

  readonly isCurrentWeek = computed(() => this._loadedWeek() === currentWeekMonday());
  readonly hasAnyDirty = computed(() => this._dirty().size > 0);

  /** Initialise — call once from an app initializer or bootstrap effect. */
  async init(): Promise<void> {
    await this.loadWeek(this._loadedWeek());
  }

  entryFor(projectId: string): ProjectWeekEntry | undefined {
    return this._entries()[projectId];
  }

  isDirty(projectId: string): boolean {
    return this._dirty().has(projectId);
  }

  /**
   * Merge a partial update into a project's entry. Marks it dirty.
   * Does NOT persist — call `saveProject` explicitly (or `saveAll`).
   */
  patchEntry(projectId: string, patch: Partial<ProjectWeekEntry>): void {
    const current = this._entries();
    const merged: ProjectWeekEntry = {
      ...(current[projectId] ?? {}),
      ...patch,
      _lastEditBy: this.auth.currentUser()?.name ?? 'Unknown',
      _lastEditAt: new Date().toISOString(),
    };
    this._entries.set({ ...current, [projectId]: merged });

    if (!this._dirty().has(projectId)) {
      // First edit of this session — snapshot the pre-edit state so
      // "Discard" can revert cleanly.
      this.snapshot[projectId] = current[projectId] ?? this.emptyEntry();
    }
    this.markDirty(projectId, true);
  }

  async saveProject(projectId: string, projectName?: string): Promise<void> {
    const entry = this._entries()[projectId];
    if (!entry) return;
    await this.weekRepo.upsertEntry(this._loadedWeek(), projectId, entry);
    this.markDirty(projectId, false);
    delete this.snapshot[projectId];

    const user = this.auth.currentUser();
    if (user) {
      this.audit.record({
        userId: user.id,
        userName: user.name,
        role: user.role,
        action: 'Form Updated',
        project: projectName,
        detail: `Saved entry for week ${this._loadedWeek()}`,
      });
    }
  }

  /* ------------------------------------------------------------------
   * Task-level helpers
   *
   * Each mutation goes through `mutateTasks` so we keep the dirty
   * bookkeeping + last-edited metadata in one place. Callers just
   * describe *what* they want to change to the tasks array.
   * ---------------------------------------------------------------- */

  tasksFor(projectId: string): WeekTask[] {
    return this.entryFor(projectId)?.weekTasks ?? [];
  }

  addTask(projectId: string, name = ''): WeekTask {
    const task: WeekTask = {
      id: 'wt_' + shortId(),
      name,
      status: 'not-started',
      assignedTo: [],
    };
    this.mutateTasks(projectId, (tasks) => [...tasks, task]);
    return task;
  }

  removeTask(projectId: string, taskId: string): void {
    this.mutateTasks(projectId, (tasks) => tasks.filter((t) => t.id !== taskId));
  }

  updateTask(projectId: string, taskId: string, patch: Partial<WeekTask>): void {
    this.mutateTasks(projectId, (tasks) =>
      tasks.map((t) => (t.id === taskId ? this.applyTaskPatch(t, patch) : t)),
    );
  }

  setTaskStatus(projectId: string, taskId: string, status: TaskStatus): void {
    const now = new Date().toISOString();
    const patch: Partial<WeekTask> = { status };
    if (status === 'completed') {
      patch._completedBy = this.auth.currentUser()?.name ?? 'Unknown';
      patch._completedAt = now;
    } else {
      // Un-completing clears the metadata to keep the doc honest.
      patch._completedBy = undefined;
      patch._completedAt = undefined;
    }
    this.updateTask(projectId, taskId, patch);
  }

  toggleAssignee(projectId: string, taskId: string, userId: string): void {
    this.mutateTasks(projectId, (tasks) =>
      tasks.map((t) => {
        if (t.id !== taskId) return t;
        const set = new Set(t.assignedTo);
        if (set.has(userId)) set.delete(userId);
        else set.add(userId);
        return { ...t, assignedTo: Array.from(set) };
      }),
    );
  }

  setAssignees(projectId: string, taskId: string, userIds: string[]): void {
    this.updateTask(projectId, taskId, { assignedTo: [...userIds] });
  }

  private mutateTasks(
    projectId: string,
    mutator: (tasks: WeekTask[]) => WeekTask[],
  ): void {
    const current = this._entries();
    const prev = current[projectId] ?? {};
    const nextTasks = mutator(prev.weekTasks ?? []);
    this.patchEntry(projectId, { weekTasks: nextTasks });
  }

  private applyTaskPatch(task: WeekTask, patch: Partial<WeekTask>): WeekTask {
    // Explicit undefined in a patch clears the field — spread would keep it.
    const next = { ...task } as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(patch)) {
      if (v === undefined) delete next[k];
      else next[k] = v;
    }
    return next as unknown as WeekTask;
  }

  discardProject(projectId: string): void {
    const prev = this.snapshot[projectId];
    const next = { ...this._entries() };
    if (prev) {
      next[projectId] = prev;
    } else {
      delete next[projectId];
    }
    this._entries.set(next);
    this.markDirty(projectId, false);
    delete this.snapshot[projectId];
  }

  async prevWeek(): Promise<void> {
    return this.loadWeek(addWeeks(this._loadedWeek(), -1));
  }

  async nextWeek(): Promise<void> {
    return this.loadWeek(addWeeks(this._loadedWeek(), 1));
  }

  async goToCurrentWeek(): Promise<void> {
    return this.loadWeek(currentWeekMonday());
  }

  async loadWeek(weekStart: IsoDate): Promise<void> {
    const monday = mondayOf(weekStart);
    this._loading.set(true);
    try {
      // Guard against losing unsaved edits on the outgoing week.
      // We drop the dirty tracking but the caller can inspect `hasAnyDirty()`
      // beforehand if they want to prompt.
      const doc = await this.weekRepo.load(monday);
      let entries = doc?.entries ?? {};

      // Auto-mark overdue: tasks whose due date has passed and that are
      // still in an "in-flight" status flip to delay. We do it here so
      // the correction is stored, not just visually derived — otherwise
      // Dashboard/Alerts would need the same rule everywhere.
      const overdue = this.applyOverdueRules(entries, monday);
      if (overdue.changed && Object.keys(overdue.entries).length > 0) {
        await this.weekRepo.save(monday, overdue.entries);
        entries = overdue.entries;
      }

      this._entries.set(entries);
      this._dirty.set(new Set());
      this.snapshot = {};
      this._loadedWeek.set(monday);
      localStorage.setItem(LS_LAST_WEEK, monday);
    } finally {
      this._loading.set(false);
    }
  }

  /**
   * Pure function — walks the entries and flips overdue tasks to delay.
   * Doesn't touch `this` state directly; callers decide whether to persist.
   */
  private applyOverdueRules(
    entries: Record<string, ProjectWeekEntry>,
    weekStart: IsoDate,
  ): { entries: Record<string, ProjectWeekEntry>; changed: boolean } {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    let changed = false;
    const next: Record<string, ProjectWeekEntry> = { ...entries };

    for (const [pid, entry] of Object.entries(entries)) {
      const tasks = entry.weekTasks;
      if (!tasks?.length) continue;

      let touched = false;
      const updated = tasks.map((t) => {
        if (!t.taskDueDate) return t;
        if (t.status === 'completed' || t.status === 'hold' || t.status === 'delay') return t;
        const due = new Date(t.taskDueDate + 'T00:00:00');
        if (due >= today) return t;
        touched = true;
        return {
          ...t,
          status: 'delay' as const,
          originalWeek: t.originalWeek || t.carriedWeek || weekStart,
        };
      });

      if (touched) {
        next[pid] = { ...entry, weekTasks: updated };
        changed = true;
      }
    }

    return { entries: next, changed };
  }

  private markDirty(projectId: string, on: boolean): void {
    const s = new Set(this._dirty());
    if (on) s.add(projectId);
    else s.delete(projectId);
    this._dirty.set(s);
  }

  private emptyEntry(): ProjectWeekEntry {
    return {};
  }

  private restoreLastWeek(): IsoDate {
    try {
      const raw = localStorage.getItem(LS_LAST_WEEK);
      return raw ? mondayOf(raw) : currentWeekMonday();
    } catch {
      return currentWeekMonday();
    }
  }
}

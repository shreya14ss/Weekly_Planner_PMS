import { Injectable, computed, inject, signal } from '@angular/core';

import { IsoDate } from '@models/common';
import { PendingTaskItem, ProjectWeekEntry, TaskStatus, WeekTask } from '@models/week';
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

  removeTask(projectId: string, taskId: string, projectName?: string): void {
    const removed = this.tasksFor(projectId).find((t) => t.id === taskId);
    this.mutateTasks(projectId, (tasks) => tasks.filter((t) => t.id !== taskId));

    const user = this.auth.currentUser();
    if (user && removed) {
      this.audit.record({
        userId: user.id,
        userName: user.name,
        role: user.role,
        action: 'Task Deleted',
        project: projectName,
        detail: `Deleted: "${removed.name || 'unnamed'}"`,
      });
    }
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

  /* ------------------------------------------------------------------
   * Carry-forward
   *
   * A pending task is one from a previous week that is not `completed`
   * and hasn't already been carried into the current week. Carrying
   * writes a fresh copy into the target week (leaving the source
   * intact as an audit trail) with `carriedFrom`, `carriedWeek`, and
   * `originalWeek` set so the delay counter keeps ticking.
   * ---------------------------------------------------------------- */

  /**
   * Edit a task that still lives in a previous week (i.e. hasn't been
   * carried yet). Used by the pending-queue UI so PMs/TLs can set a
   * status or reassign engineers *before* carrying the task forward —
   * legacy parity with the Priority Queue card.
   */
  async patchPendingTask(
    week: IsoDate,
    projectId: string,
    taskId: string,
    patch: Partial<WeekTask>,
  ): Promise<void> {
    const doc = await this.weekRepo.load(week);
    const entry = doc?.entries[projectId];
    const tasks = entry?.weekTasks;
    if (!doc || !entry || !tasks) return;

    const idx = tasks.findIndex((t) => t.id === taskId);
    if (idx < 0) return;

    const nextTasks = [...tasks];
    nextTasks[idx] = this.applyTaskPatch(tasks[idx], patch);
    const now = new Date().toISOString();
    const nextEntry: ProjectWeekEntry = {
      ...entry,
      weekTasks: nextTasks,
      _lastEditBy: this.auth.currentUser()?.name ?? 'System',
      _lastEditAt: now,
    };
    await this.weekRepo.upsertEntry(week, projectId, nextEntry);
  }

  async loadPending(maxWeeks = 4): Promise<PendingTaskItem[]> {
    const current = this._loadedWeek();
    // Anything already carried in — filter it out to avoid duplicates.
    const carriedIn = new Set<string>();
    for (const entry of Object.values(this._entries())) {
      for (const t of entry.weekTasks ?? []) {
        if (t.carriedFrom) carriedIn.add(t.carriedFrom);
      }
    }

    const items: PendingTaskItem[] = [];
    const scan: { week: IsoDate; found: 'no-doc' | number; kept: number }[] = [];
    for (let i = 1; i <= maxWeeks; i++) {
      const week = addWeeks(current, -i);
      const doc = await this.weekRepo.load(week);
      if (!doc) {
        scan.push({ week, found: 'no-doc', kept: 0 });
        continue;
      }
      let rawCount = 0;
      let keptCount = 0;
      for (const [projectId, entry] of Object.entries(doc.entries)) {
        for (const task of entry.weekTasks ?? []) {
          rawCount++;
          if (task.status === 'completed') continue;
          if (carriedIn.has(task.id)) continue;
          items.push({ week, projectId, task });
          keptCount++;
        }
      }
      scan.push({ week, found: rawCount, kept: keptCount });
    }
    // Temporary diagnostic — leave until the "empty on dashboard" bug is
    // pinned down. Safe to remove after.
    console.debug('[pending] loadedWeek=%s scan=%o total=%d', current, scan, items.length);
    return items;
  }

  /**
   * Copy a task from `fromWeek` into `toWeek`. Preserves due date and
   * assignees. Completed status resets to `todo` (a completed task
   * doesn't logically carry).
   *
   * Writes directly through WeekRepository — does NOT go through the
   * dirty/save flow because the target week isn't necessarily the one
   * the user is looking at, and this is a deliberate action anyway.
   */
  async carryTask(
    fromWeek: IsoDate,
    projectId: string,
    taskId: string,
    toWeek: IsoDate,
  ): Promise<void> {
    const srcDoc = await this.weekRepo.load(fromWeek);
    const srcTask = srcDoc?.entries[projectId]?.weekTasks?.find((t) => t.id === taskId);
    if (!srcTask) throw new Error(`Source task ${taskId} not found in week ${fromWeek}`);

    const originalWeek = srcTask.originalWeek ?? srcTask.carriedWeek ?? fromWeek;
    const inheritedStatus: TaskStatus = srcTask.status === 'completed' ? 'todo' : srcTask.status;

    const newTask: WeekTask = {
      id: 'wt_' + shortId(),
      name: srcTask.name,
      status: inheritedStatus,
      assignedTo: [...srcTask.assignedTo],
      remark: srcTask.remark,
      taskDueDate: srcTask.taskDueDate,
      carriedFrom: srcTask.id,
      carriedWeek: fromWeek,
      originalWeek,
    };

    // If we're carrying into the currently-loaded week, mutate live
    // state via patchEntry so the UI updates without a reload AND the
    // save/discard flow catches it. Otherwise, write straight through
    // the repository.
    if (toWeek === this._loadedWeek()) {
      const currentEntry = this._entries()[projectId] ?? {};
      const nextTasks = [...(currentEntry.weekTasks ?? []), newTask];
      this.patchEntry(projectId, { weekTasks: nextTasks });
    } else {
      const tgtDoc = await this.weekRepo.load(toWeek);
      const tgtEntry: ProjectWeekEntry = tgtDoc?.entries[projectId] ?? {};
      const now = new Date().toISOString();
      const nextEntry: ProjectWeekEntry = {
        ...tgtEntry,
        weekTasks: [...(tgtEntry.weekTasks ?? []), newTask],
        _lastEditBy: this.auth.currentUser()?.name ?? 'System',
        _lastEditAt: now,
      };
      await this.weekRepo.upsertEntry(toWeek, projectId, nextEntry);
    }

    const user = this.auth.currentUser();
    if (user) {
      this.audit.record({
        userId: user.id,
        userName: user.name,
        role: user.role,
        action: 'Task Moved',
        project: projectId,
        detail: `"${srcTask.name}" carried from ${fromWeek} to ${toWeek}`,
      });
    }
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

import { Injectable, computed, inject, signal } from '@angular/core';

import { IsoDate } from '@models/common';
import { ProjectWeekEntry } from '@models/week';
import { WeekRepository } from '@core/pouchdb/week.repository';
import { AuditRepository } from '@core/pouchdb/audit.repository';
import { AuthService } from '@core/services/auth.service';
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
      this._entries.set(doc?.entries ?? {});
      this._dirty.set(new Set());
      this.snapshot = {};
      this._loadedWeek.set(monday);
      localStorage.setItem(LS_LAST_WEEK, monday);
    } finally {
      this._loading.set(false);
    }
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

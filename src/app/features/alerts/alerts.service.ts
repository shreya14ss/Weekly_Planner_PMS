import { Injectable, computed, inject, signal } from '@angular/core';

import { ProjectRepository } from '@core/pouchdb/project.repository';
import { UserRepository } from '@core/pouchdb/user.repository';
import { AuthService } from '@core/services/auth.service';
import { WeekStateService } from '@core/services/week-state.service';
import { isProjectVisible } from '@core/services/project-permissions';
import { ProjectDoc } from '@models/project';
import {
  effectiveStatus,
  isActiveStatus,
  isDoneStatus,
  isOnHold,
} from '@features/dashboard/status-utils';

export interface AlertOverdueRow {
  project: ProjectDoc;
  displayName: string;
  targetDate: string;
  daysOverdue: number;
}

export interface AlertTaskDelayRow {
  project: ProjectDoc;
  displayName: string;
  taskId: string;
  taskName: string;
  assigneeNames: string[];
  daysOverdue?: number;
}

export interface AlertOnHoldRow {
  project: ProjectDoc;
  displayName: string;
  reason: string;
}

export interface AlertNoUpdateRow {
  project: ProjectDoc;
  displayName: string;
}

/**
 * Alerts have their own filter axes (Client + TL/Engineer) — legacy
 * did the same. Kept in a dedicated service so switching tabs doesn't
 * inherit stale dashboard filters.
 */
@Injectable({ providedIn: 'root' })
export class AlertsService {
  private readonly projects = inject(ProjectRepository);
  private readonly users = inject(UserRepository);
  private readonly auth = inject(AuthService);
  private readonly weekState = inject(WeekStateService);

  readonly client = signal<'all' | string>('all');
  readonly tl = signal<'all' | string>('all');

  readonly clientOptions = computed(() => {
    const set = new Set<string>();
    for (const p of this.projects.all()) if (p.client) set.add(p.client);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  readonly tlOptions = computed(() => {
    const src =
      this.client() === 'all'
        ? this.projects.all()
        : this.projects.all().filter((p) => p.client === this.client());
    const set = new Set<string>();
    for (const p of src) {
      for (const t of p.tls) if (t?.trim()) set.add(t.trim());
      for (const e of p.engineers) if (e?.trim()) set.add(e.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  private readonly filtered = computed<ProjectDoc[]>(() => {
    const user = this.auth.currentUser();
    const client = this.client();
    const tl = this.tl();

    return this.projects
      .all()
      .filter((p) => isProjectVisible(user, p))
      .filter((p) => client === 'all' || p.client === client)
      .filter((p) => {
        if (tl === 'all') return true;
        const t = tl.trim().toLowerCase();
        return (
          p.tls.some((x) => x.trim().toLowerCase() === t) ||
          p.engineers.some((x) => x.trim().toLowerCase() === t)
        );
      });
  });

  readonly overdue = computed<AlertOverdueRow[]>(() => {
    const entries = this.weekState.entries();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows: AlertOverdueRow[] = [];
    for (const p of this.filtered()) {
      const entry = entries[p._id];
      const st = effectiveStatus(p, entry);
      if (isDoneStatus(st)) continue;
      const target = entry?.targetDate;
      if (!target) continue;
      const due = new Date(target + 'T00:00:00');
      if (due >= today) continue;
      const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400000);
      rows.push({
        project: p,
        displayName: displayNameFor(p),
        targetDate: target,
        daysOverdue,
      });
    }
    return rows.sort((a, b) => b.daysOverdue - a.daysOverdue);
  });

  readonly taskDelays = computed<AlertTaskDelayRow[]>(() => {
    const entries = this.weekState.entries();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows: AlertTaskDelayRow[] = [];
    for (const p of this.filtered()) {
      const entry = entries[p._id];
      const st = effectiveStatus(p, entry);
      if (isDoneStatus(st)) continue;
      for (const t of entry?.weekTasks ?? []) {
        if (t.status !== 'delay') continue;
        let daysOverdue: number | undefined;
        if (t.taskDueDate) {
          const due = new Date(t.taskDueDate + 'T00:00:00');
          const diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
          daysOverdue = diff > 0 ? diff : 0;
        }
        rows.push({
          project: p,
          displayName: displayNameFor(p),
          taskId: t.id,
          taskName: t.name || 'Untitled task',
          assigneeNames: (t.assignedTo ?? [])
            .map((uid) => this.users.get(uid)?.name)
            .filter((n): n is string => !!n),
          daysOverdue,
        });
      }
    }
    return rows.sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
  });

  readonly onHold = computed<AlertOnHoldRow[]>(() => {
    const entries = this.weekState.entries();
    const rows: AlertOnHoldRow[] = [];
    for (const p of this.filtered()) {
      const entry = entries[p._id];
      const st = effectiveStatus(p, entry);
      if (!isOnHold(st) || isDoneStatus(st)) continue;
      const remarks = entry?.remarks ?? p.remarks;
      rows.push({
        project: p,
        displayName: displayNameFor(p),
        reason: remarks || 'No reason recorded — add remarks on the project card.',
      });
    }
    return rows;
  });

  readonly noUpdate = computed<AlertNoUpdateRow[]>(() => {
    const entries = this.weekState.entries();
    const rows: AlertNoUpdateRow[] = [];
    for (const p of this.filtered()) {
      const entry = entries[p._id];
      const st = effectiveStatus(p, entry);
      if (isDoneStatus(st)) continue;
      if (!isActiveStatus(st)) continue;
      if (
        entry?.weeklyTarget ||
        entry?.description ||
        entry?.status ||
        entry?.targetDate ||
        (entry?.weekTasks && entry.weekTasks.length > 0)
      ) {
        continue;
      }
      rows.push({ project: p, displayName: displayNameFor(p) });
    }
    return rows;
  });

  readonly total = computed(
    () =>
      this.overdue().length +
      this.taskDelays().length +
      this.onHold().length +
      this.noUpdate().length,
  );

  reset(): void {
    this.client.set('all');
    this.tl.set('all');
  }
}

function displayNameFor(p: ProjectDoc): string {
  return p.name === '—' || !p.name ? `${p.client} Site` : p.name;
}

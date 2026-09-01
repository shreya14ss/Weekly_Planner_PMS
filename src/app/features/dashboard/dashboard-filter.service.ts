import { Injectable, computed, inject, signal } from '@angular/core';

import { ProjectRepository } from '@core/pouchdb/project.repository';
import { AuthService } from '@core/services/auth.service';
import { WeekStateService } from '@core/services/week-state.service';
import { isProjectVisible } from '@core/services/project-permissions';
import { ProjectDoc } from '@models/project';
import { effectiveStatus, isDoneStatus } from '@features/dashboard/status-utils';

export type DashStatusFilter =
  | 'all'
  | 'active'
  | 'delayed'
  | 'hold'
  | 'not-started'
  | 'completed'
  | 'no-update';

/**
 * Dashboard filter state + derived scope.
 *
 * Three axes:
 *   - client (dropdown, deduped from projects)
 *   - tl (dropdown, deduped from TLs + engineers)
 *   - status (well-known bucket names)
 *
 * `scope` is the projects list after role visibility + all three
 * filters are applied. Completed projects are excluded by default so
 * KPI numbers focus on in-flight work — same convention as the legacy
 * dashboard.
 */
@Injectable({ providedIn: 'root' })
export class DashboardFilterService {
  private readonly projects = inject(ProjectRepository);
  private readonly auth = inject(AuthService);
  private readonly weekState = inject(WeekStateService);

  readonly client = signal<'all' | string>('all');
  readonly tl = signal<'all' | string>('all');
  readonly status = signal<DashStatusFilter>('all');

  /** Clients available in the current portfolio, sorted. */
  readonly clientOptions = computed(() => {
    const set = new Set<string>();
    for (const p of this.projects.all()) if (p.client) set.add(p.client);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  /**
   * Names of TLs + engineers across the portfolio — filtered by the
   * selected client (if any) so the dropdown stays relevant.
   */
  readonly tlOptions = computed(() => {
    const selectedClient = this.client();
    const src =
      selectedClient === 'all'
        ? this.projects.all()
        : this.projects.all().filter((p) => p.client === selectedClient);
    const set = new Set<string>();
    for (const p of src) {
      for (const t of p.tls) if (t?.trim()) set.add(t.trim());
      for (const e of p.engineers) if (e?.trim()) set.add(e.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  /** The scope every dashboard widget should aggregate over. */
  readonly scope = computed<ProjectDoc[]>(() => {
    const user = this.auth.currentUser();
    const client = this.client();
    const tl = this.tl();
    const status = this.status();
    const entries = this.weekState.entries();

    return this.projects
      .all()
      .filter((p) => isProjectVisible(user, p))
      .filter((p) => !isDoneStatus(effectiveStatus(p, entries[p._id])))
      .filter((p) => client === 'all' || p.client === client)
      .filter((p) => {
        if (tl === 'all') return true;
        const t = tl.trim().toLowerCase();
        return (
          p.tls.some((x) => x.trim().toLowerCase() === t) ||
          p.engineers.some((x) => x.trim().toLowerCase() === t)
        );
      })
      .filter((p) => this.matchesStatusFilter(p, status));
  });

  reset(): void {
    this.client.set('all');
    this.tl.set('all');
    this.status.set('all');
  }

  private matchesStatusFilter(p: ProjectDoc, filter: DashStatusFilter): boolean {
    if (filter === 'all') return true;
    const entries = this.weekState.entries();
    const st = effectiveStatus(p, entries[p._id]);
    const stLower = st.toLowerCase();

    switch (filter) {
      case 'active':
        return (
          stLower.includes('in progress') ||
          stLower.includes('testing') ||
          stLower.includes('configuration') ||
          stLower.includes('survey')
        );
      case 'completed':
        return isDoneStatus(st);
      case 'hold':
        return stLower.includes('on hold');
      case 'not-started':
        return stLower.includes('not started');
      case 'no-update':
        return !this.hasWeekEntry(p._id);
      case 'delayed':
        return this.isDelayed(p);
      default:
        return true;
    }
  }

  private hasWeekEntry(projectId: string): boolean {
    const e = this.weekState.entries()[projectId];
    if (!e) return false;
    return !!(
      e.weeklyTarget ||
      e.description ||
      e.status ||
      e.targetDate ||
      e.weekTasks?.length
    );
  }

  private isDelayed(p: ProjectDoc): boolean {
    const entry = this.weekState.entries()[p._id];
    if (!entry) return false;
    const st = effectiveStatus(p, entry);
    if (isDoneStatus(st)) return false;
    if (entry.targetDate) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const due = new Date(entry.targetDate + 'T00:00:00');
      if (due < today) return true;
    }
    return (entry.weekTasks ?? []).some((t) => t.status === 'delay');
  }
}

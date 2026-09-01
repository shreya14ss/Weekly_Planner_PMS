import { Injectable, computed, inject, signal } from '@angular/core';

import { ProjectRepository } from '@core/pouchdb/project.repository';
import { UserRepository } from '@core/pouchdb/user.repository';
import { AuthService } from '@core/services/auth.service';
import { WeekStateService } from '@core/services/week-state.service';
import { isProjectVisible } from '@core/services/project-permissions';
import { ProjectDoc } from '@models/project';
import { WeekTask } from '@models/week';
import { effectiveStatus, isDoneStatus } from '@features/dashboard/status-utils';

export interface CompletedProjectRow {
  project: ProjectDoc;
  displayName: string;
  status: string;
  completedBy: string;
  completedAt: string;
  targetDate?: string;
  weeklyTarget?: string;
  description?: string;
  tls: string[];
  engineers: string[];
  tasks: WeekTask[];
  taskCounts: {
    total: number;
    done: number;
    delayed: number;
    incomplete: number;
  };
  onTimeStatus?: {
    label: string;
    onTime: boolean;
    daysDiff: number;
  };
}

@Injectable({ providedIn: 'root' })
export class CompletedService {
  private readonly projects = inject(ProjectRepository);
  readonly users = inject(UserRepository);
  private readonly auth = inject(AuthService);
  private readonly weekState = inject(WeekStateService);

  readonly client = signal<'all' | string>('all');

  readonly clientOptions = computed(() => {
    const set = new Set<string>();
    for (const p of this.projects.all()) {
      if (!p.client) continue;
      const st = effectiveStatus(p, this.weekState.entries()[p._id]);
      if (isDoneStatus(st)) set.add(p.client);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  readonly rows = computed<CompletedProjectRow[]>(() => {
    const user = this.auth.currentUser();
    const entries = this.weekState.entries();
    const client = this.client();

    const rows: CompletedProjectRow[] = [];
    for (const p of this.projects.all()) {
      if (!isProjectVisible(user, p)) continue;
      const entry = entries[p._id];
      const st = effectiveStatus(p, entry);
      if (!isDoneStatus(st)) continue;
      if (client !== 'all' && p.client !== client) continue;

      const tasks = entry?.weekTasks ?? [];
      const done = tasks.filter((t) => t.status === 'completed').length;
      const delayed = tasks.filter((t) => t.status === 'delay').length;

      rows.push({
        project: p,
        displayName: p.name === '—' || !p.name ? `${p.client} Site` : p.name,
        status: st,
        completedBy: entry?._completedBy ?? entry?._lastEditBy ?? '—',
        completedAt: entry?._completedAt ?? entry?._lastEditAt ?? '',
        targetDate: entry?.targetDate,
        weeklyTarget: entry?.weeklyTarget,
        description: entry?.description,
        tls: p.tls,
        engineers: p.engineers,
        tasks,
        taskCounts: {
          total: tasks.length,
          done,
          delayed,
          incomplete: tasks.length - done - delayed,
        },
        onTimeStatus: this.computeOnTime(entry?.targetDate, entry?._completedAt),
      });
    }

    // Most recently completed first.
    return rows.sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  });

  readonly statusBreakdown = computed(() => {
    const map = new Map<string, number>();
    for (const r of this.rows()) map.set(r.status, (map.get(r.status) ?? 0) + 1);
    return Array.from(map.entries()).map(([status, count]) => ({ status, count }));
  });

  readonly total = computed(() => this.rows().length);

  reset(): void {
    this.client.set('all');
  }

  private computeOnTime(
    targetDate: string | undefined,
    completedAt: string | undefined,
  ): CompletedProjectRow['onTimeStatus'] {
    if (!targetDate || !completedAt) return undefined;
    const target = new Date(targetDate + 'T00:00:00');
    // completedAt may be ISO or en-IN locale — Date() handles ISO, we
    // fall back gracefully otherwise.
    const done = new Date(completedAt);
    if (isNaN(target.getTime()) || isNaN(done.getTime())) return undefined;
    done.setHours(0, 0, 0, 0);
    target.setHours(0, 0, 0, 0);
    const diff = Math.round((done.getTime() - target.getTime()) / 86400000);
    if (diff <= 0) {
      return {
        onTime: true,
        daysDiff: Math.abs(diff),
        label: diff < 0 ? `On time (${Math.abs(diff)}d early)` : 'On time',
      };
    }
    return { onTime: false, daysDiff: diff, label: `${diff}d late` };
  }
}

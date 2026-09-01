import { computed, inject } from '@angular/core';

import { UserRepository } from '@core/pouchdb/user.repository';
import { WeekStateService } from '@core/services/week-state.service';
import { ProjectDoc } from '@models/project';
import { ProjectWeekEntry } from '@models/week';
import { effectiveStatus, isActiveStatus, isDoneStatus, isOnHold } from './status-utils';

export interface Kpis {
  total: number;
  active: number;
  done: number;
  hold: number;
  delayed: number;
  notFilled: number;
}

export interface AttentionProject {
  project: ProjectDoc;
  displayName: string;
  targetDate?: string;
  reason?: string;
}

export interface ClientBar {
  client: string;
  total: number;
  active: number;
  done: number;
  hold: number;
  other: number;
}

export interface StatusSegment {
  status: string;
  count: number;
  color: string;
}

export interface EngineerRow {
  name: string;
  total: number;
  active: number;
  done: number;
  hold: number;
  delayed: number;
  notFilled: number;
  progressPct: number;
}

export interface ProjectTaskBreakdownRow {
  projectId: string;
  client: string;
  displayName: string;
  total: number;
  pending: number;
  inProgress: number;
  delayed: number;
  hold: number;
  done: number;
}

export interface DelayedTaskRow {
  projectId: string;
  client: string;
  projectName: string;
  engineers: string[];
  taskName: string;
  taskId: string;
  assigneeNames: string[];
  dueDate?: string;
  daysOverdue?: number;
}

/**
 * Signal-based dashboard aggregations.
 *
 * Consumer passes a `scope: Signal<ProjectDoc[]>` (usually
 * DashboardFilterService.scope) and the returned `agg` object has
 * pre-computed KPI counts, per-client bars, donut segments, and
 * attention lists. Everything is `computed` so widgets get reactive
 * updates for free.
 */
export function useDashboardAggregations(scope: () => ProjectDoc[]) {
  const weekState = inject(WeekStateService);
  const usersRepo = inject(UserRepository);

  const entriesSig = weekState.entries;

  const kpis = computed<Kpis>(() => {
    const projects = scope();
    const entries = entriesSig();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let active = 0,
      done = 0,
      hold = 0,
      delayed = 0,
      notFilled = 0;

    for (const p of projects) {
      const entry = entries[p._id];
      const st = effectiveStatus(p, entry);
      if (isDoneStatus(st)) done++;
      if (isActiveStatus(st)) active++;
      if (isOnHold(st)) hold++;

      const target = entry?.targetDate;
      const pastTarget = target && new Date(target + 'T00:00:00') < today && !isDoneStatus(st);
      const hasDelayedTask = (entry?.weekTasks ?? []).some((t) => t.status === 'delay');
      if (pastTarget || hasDelayedTask) delayed++;

      if (!hasFilledEntry(entry)) notFilled++;
    }

    return {
      total: projects.length,
      active,
      done,
      hold,
      delayed,
      notFilled,
    };
  });

  const clientBars = computed<ClientBar[]>(() => {
    const projects = scope();
    const entries = entriesSig();
    const map = new Map<string, ClientBar>();

    for (const p of projects) {
      const client = p.client || 'Unknown';
      const st = effectiveStatus(p, entries[p._id]);
      const bucket = map.get(client) ?? {
        client,
        total: 0,
        active: 0,
        done: 0,
        hold: 0,
        other: 0,
      };
      bucket.total++;
      if (isActiveStatus(st)) bucket.active++;
      else if (isDoneStatus(st)) bucket.done++;
      else if (isOnHold(st)) bucket.hold++;
      else bucket.other++;
      map.set(client, bucket);
    }

    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  });

  const statusSegments = computed<StatusSegment[]>(() => {
    const projects = scope();
    const entries = entriesSig();
    const counts = new Map<string, number>();

    for (const p of projects) {
      const st = effectiveStatus(p, entries[p._id]) || 'Not Set';
      counts.set(st, (counts.get(st) ?? 0) + 1);
    }

    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([status, count]) => ({ status, count, color: colorForStatus(status) }));
  });

  const delayedList = computed<AttentionProject[]>(() => {
    const projects = scope();
    const entries = entriesSig();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows: AttentionProject[] = [];

    for (const p of projects) {
      const entry = entries[p._id];
      const st = effectiveStatus(p, entry);
      if (isDoneStatus(st)) continue;

      const target = entry?.targetDate;
      const overdue = target && new Date(target + 'T00:00:00') < today;
      if (!overdue) continue;

      rows.push({
        project: p,
        displayName: displayNameFor(p),
        targetDate: target,
        reason: `Target was ${target}`,
      });
    }

    return rows.sort((a, b) => (a.targetDate ?? '').localeCompare(b.targetDate ?? ''));
  });

  const onHoldList = computed<AttentionProject[]>(() => {
    const projects = scope();
    const entries = entriesSig();
    const rows: AttentionProject[] = [];

    for (const p of projects) {
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

  const engineerRows = computed<EngineerRow[]>(() => {
    const projects = scope();
    const entries = entriesSig();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const map = new Map<string, EngineerRow>();
    for (const p of projects) {
      const entry = entries[p._id];
      const st = effectiveStatus(p, entry);
      const target = entry?.targetDate;
      const past =
        !!target && new Date(target + 'T00:00:00') < today && !isDoneStatus(st);
      const filled = hasFilledEntry(entry);

      for (const raw of p.engineers) {
        const name = raw.trim();
        if (!name) continue;
        const row = map.get(name) ?? {
          name,
          total: 0,
          active: 0,
          done: 0,
          hold: 0,
          delayed: 0,
          notFilled: 0,
          progressPct: 0,
        };
        row.total++;
        if (isActiveStatus(st)) row.active++;
        if (isDoneStatus(st)) row.done++;
        if (isOnHold(st)) row.hold++;
        if (past) row.delayed++;
        if (!filled) row.notFilled++;
        map.set(name, row);
      }
    }

    // Progress = done ÷ total. Sort by total desc so the most-loaded
    // engineers surface first.
    const rows = Array.from(map.values());
    rows.forEach((r) => (r.progressPct = r.total ? Math.round((r.done / r.total) * 100) : 0));
    rows.sort((a, b) => b.total - a.total);
    return rows;
  });

  const projectTaskBreakdown = computed<ProjectTaskBreakdownRow[]>(() => {
    const projects = scope();
    const entries = entriesSig();
    const rows: ProjectTaskBreakdownRow[] = [];

    for (const p of projects) {
      const tasks = entries[p._id]?.weekTasks ?? [];
      if (tasks.length === 0) continue;
      let pending = 0,
        inProgress = 0,
        delayed = 0,
        hold = 0,
        done = 0;
      for (const t of tasks) {
        const s = t.status;
        if (s === 'completed') done++;
        else if (s === 'in-progress') inProgress++;
        else if (s === 'delay') delayed++;
        else if (s === 'hold') hold++;
        else pending++;
      }
      rows.push({
        projectId: p._id,
        client: p.client,
        displayName: displayNameFor(p),
        total: tasks.length,
        pending,
        inProgress,
        delayed,
        hold,
        done,
      });
    }
    // Delayed first, then most tasks
    rows.sort((a, b) => b.delayed - a.delayed || b.total - a.total);
    return rows;
  });

  const delayedTasks = computed<DelayedTaskRow[]>(() => {
    const projects = scope();
    const entries = entriesSig();
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const rows: DelayedTaskRow[] = [];

    for (const p of projects) {
      const tasks = entries[p._id]?.weekTasks ?? [];
      for (const t of tasks) {
        if (t.status !== 'delay') continue;
        let daysOverdue: number | undefined;
        if (t.taskDueDate) {
          const due = new Date(t.taskDueDate + 'T00:00:00');
          const diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
          daysOverdue = diff > 0 ? diff : 0;
        }
        rows.push({
          projectId: p._id,
          client: p.client,
          projectName: displayNameFor(p),
          engineers: [...p.engineers],
          taskId: t.id,
          taskName: t.name || 'Untitled task',
          assigneeNames: (t.assignedTo ?? [])
            .map((uid) => usersRepo.get(uid)?.name)
            .filter((n): n is string => !!n),
          dueDate: t.taskDueDate,
          daysOverdue,
        });
      }
    }
    // Most-overdue first
    rows.sort((a, b) => (b.daysOverdue ?? 0) - (a.daysOverdue ?? 0));
    return rows;
  });

  return {
    kpis,
    clientBars,
    statusSegments,
    delayedList,
    onHoldList,
    engineerRows,
    projectTaskBreakdown,
    delayedTasks,
  };
}

function hasFilledEntry(e: ProjectWeekEntry | undefined): boolean {
  if (!e) return false;
  return !!(
    e.weeklyTarget ||
    e.description ||
    e.status ||
    e.targetDate ||
    (e.weekTasks && e.weekTasks.length > 0)
  );
}

function displayNameFor(p: ProjectDoc): string {
  return p.name === '—' || !p.name ? `${p.client} Site` : p.name;
}

// Duplicated import-free version — keeps this file cheap to tree-shake.
function colorForStatus(st: string): string {
  const map: Record<string, string> = {
    'In Progress': '#2563EB',
    'On Hold': '#D97706',
    'Not Started': '#6B7280',
    'Site Handed Over': '#059669',
    Completed: '#10B981',
    'SAVT Running': '#B45309',
    'Testing, Validation in Progress': '#7C3AED',
    Configuration: '#DC2626',
    'Site Survey in Progress': '#0369A1',
  };
  return map[st] ?? '#9CA3AF';
}

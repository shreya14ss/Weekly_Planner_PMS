import { computed, inject } from '@angular/core';

import { UserRepository } from '@core/pouchdb/user.repository';
import { WeekStateService } from '@core/services/week-state.service';
import { ProjectDoc } from '@models/project';
import { ProjectWeekEntry, WeekTask } from '@models/week';
import { UserRole } from '@models/user';
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

export interface TeamMember {
  name: string;
  role: UserRole | 'unknown';
  initials: string;
}

export type TrackKey = 'done' | 'hold' | 'late' | 'risk' | 'ok' | 'ns';

export interface TrackStatus {
  key: TrackKey;
  label: string;
}

export interface TaskCounts {
  total: number;
  done: number;
  inProgress: number;
  hold: number;
  delayed: number;
  notStarted: number;
  progressPct: number;
}

export interface FollowUpRow {
  projectId: string;
  client: string;
  displayName: string;
  team: TeamMember[];
  taskCounts: TaskCounts;
  trackStatus: TrackStatus;
}

export interface HealthSummary {
  onTrack: number;
  atRisk: number;
  delayed: number;
  onHold: number;
  completed: number;
  notSet: number;
}

export interface TrackerRow {
  projectId: string;
  client: string;
  displayName: string;
  engineers: string;
  weeklyTarget: string;
  taskCounts: TaskCounts;
  trackStatus: TrackStatus;
}

export interface TlPerformanceRow {
  name: string;
  role: UserRole | 'unknown';
  initials: string;
  projectCount: number;
  taskCount: number;
  done: number;
  inProgress: number;
  hold: number;
  delayed: number;
  notStarted: number;
  completionPct: number;
  delayRate: number;
  health: 'good' | 'warning' | 'bad';
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

      // Completed projects are mutually exclusive with active / hold /
      // delayed / not-filled — otherwise a project can be counted twice
      // (e.g. "delayed task on a completed project" isn't actionable).
      if (isDoneStatus(st)) {
        done++;
        continue;
      }

      if (isActiveStatus(st)) active++;
      if (isOnHold(st)) hold++;

      const target = entry?.targetDate;
      const pastTarget = target && new Date(target + 'T00:00:00') < today;
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
      // Skip completed projects — a delayed task on a done project
      // isn't actionable and would clutter the follow-up view.
      if (isDoneStatus(effectiveStatus(p, entries[p._id]))) continue;

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

  const followUpRows = computed<FollowUpRow[]>(() => {
    const projects = scope();
    const entries = entriesSig();
    const rows: FollowUpRow[] = projects.map((p) => {
      const entry = entries[p._id];
      const tasks = entry?.weekTasks ?? [];
      return {
        projectId: p._id,
        client: p.client,
        displayName: displayNameFor(p),
        team: teamFor(p, usersRepo),
        taskCounts: taskCountsFor(tasks),
        trackStatus: trackStatusFor(p, entry, tasks),
      };
    });
    // Delayed first, then those with most delayed tasks — mirrors legacy sort.
    return rows.sort(
      (a, b) => b.taskCounts.delayed - a.taskCounts.delayed || b.taskCounts.total - a.taskCounts.total,
    );
  });

  const trackerRows = computed<TrackerRow[]>(() => {
    const projects = scope();
    const entries = entriesSig();
    // Weekly tracker excludes fully-completed projects — they don't need scheduling.
    return projects
      .filter((p) => !isDoneStatus(effectiveStatus(p, entries[p._id])))
      .map<TrackerRow>((p) => {
        const entry = entries[p._id];
        const tasks = entry?.weekTasks ?? [];
        return {
          projectId: p._id,
          client: p.client,
          displayName: displayNameFor(p),
          engineers: p.engineers.join(', ') || 'Unassigned',
          weeklyTarget:
            entry?.weeklyTarget?.trim() ||
            (entry?.description ? entry.description.split('\n')[0].slice(0, 60) : ''),
          taskCounts: taskCountsFor(tasks),
          trackStatus: trackStatusFor(p, entry, tasks),
        };
      });
  });

  const healthSummary = computed<HealthSummary>(() => {
    const rows = trackerRows();
    const done = scope().filter((p) => isDoneStatus(effectiveStatus(p, entriesSig()[p._id]))).length;
    const summary: HealthSummary = {
      onTrack: 0,
      atRisk: 0,
      delayed: 0,
      onHold: 0,
      completed: done,
      notSet: 0,
    };
    for (const r of rows) {
      switch (r.trackStatus.key) {
        case 'ok':
          summary.onTrack++;
          break;
        case 'risk':
          summary.atRisk++;
          break;
        case 'late':
          summary.delayed++;
          break;
        case 'hold':
          summary.onHold++;
          break;
        case 'ns':
          summary.notSet++;
          break;
        case 'done':
          // Already counted in `completed`.
          break;
      }
    }
    return summary;
  });

  const tlPerformance = computed<TlPerformanceRow[]>(() => {
    const projects = scope();
    const entries = entriesSig();

    const map = new Map<
      string,
      {
        role: UserRole | 'unknown';
        projectIds: Set<string>;
        done: number;
        inProgress: number;
        hold: number;
        delayed: number;
        notStarted: number;
        total: number;
      }
    >();

    for (const p of projects) {
      const people = new Set<string>([...p.tls, ...p.engineers].filter((s) => s?.trim()));
      const tasks = entries[p._id]?.weekTasks ?? [];
      for (const rawName of people) {
        const name = rawName.trim();
        if (!name) continue;
        const user = usersRepo.all().find((u) => u.name.trim().toLowerCase() === name.toLowerCase());
        const row = map.get(name) ?? {
          role: user?.role ?? 'unknown',
          projectIds: new Set<string>(),
          done: 0,
          inProgress: 0,
          hold: 0,
          delayed: 0,
          notStarted: 0,
          total: 0,
        };
        row.projectIds.add(p._id);
        for (const t of tasks) {
          row.total++;
          const s = t.status;
          if (s === 'completed') row.done++;
          else if (s === 'in-progress' || s === 'todo') row.inProgress++;
          else if (s === 'hold') row.hold++;
          else if (s === 'delay') row.delayed++;
          else row.notStarted++;
        }
        map.set(name, row);
      }
    }

    const rows: TlPerformanceRow[] = Array.from(map.entries()).map(([name, r]) => {
      const total = r.total || 1;
      const delayRate = Math.round((r.delayed / total) * 100);
      const completionPct = Math.round((r.done / total) * 100);
      const health: TlPerformanceRow['health'] =
        delayRate >= 40 ? 'bad' : delayRate >= 20 ? 'warning' : 'good';
      return {
        name,
        role: r.role,
        initials: initialsOf(name),
        projectCount: r.projectIds.size,
        taskCount: r.total,
        done: r.done,
        inProgress: r.inProgress,
        hold: r.hold,
        delayed: r.delayed,
        notStarted: r.notStarted,
        completionPct,
        delayRate,
        health,
      };
    });

    // Most delayed first — same ordering as legacy.
    rows.sort((a, b) => b.delayed - a.delayed || b.taskCount - a.taskCount);
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
    followUpRows,
    trackerRows,
    healthSummary,
    tlPerformance,
  };
}

function taskCountsFor(tasks: WeekTask[]): TaskCounts {
  let done = 0,
    inProgress = 0,
    hold = 0,
    delayed = 0,
    notStarted = 0;
  for (const t of tasks) {
    const s = t.status;
    if (s === 'completed') done++;
    else if (s === 'in-progress' || s === 'todo') inProgress++;
    else if (s === 'hold') hold++;
    else if (s === 'delay') delayed++;
    else notStarted++;
  }
  const total = tasks.length;
  return {
    total,
    done,
    inProgress,
    hold,
    delayed,
    notStarted,
    progressPct: total === 0 ? 0 : Math.round((done / total) * 100),
  };
}

/**
 * Port of legacy `getTrackStatus` — a project's weekly health label.
 */
function trackStatusFor(
  p: ProjectDoc,
  entry: ProjectWeekEntry | undefined,
  tasks: WeekTask[],
): TrackStatus {
  const st = effectiveStatus(p, entry);
  if (isDoneStatus(st)) return { key: 'done', label: 'Completed' };
  if (isOnHold(st)) return { key: 'hold', label: 'On Hold' };

  if (entry?.targetDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const target = new Date(entry.targetDate + 'T00:00:00');
    if (target < today) return { key: 'late', label: 'Delayed' };
  }

  if (tasks.length === 0) {
    const hasTarget = !!(entry?.weeklyTarget || entry?.description);
    return hasTarget
      ? { key: 'risk', label: 'No Tasks Added' }
      : { key: 'ns', label: 'Not Set' };
  }

  const total = tasks.length;
  let done = 0,
    delayed = 0,
    onHoldCount = 0,
    active = 0,
    notStart = 0;
  for (const t of tasks) {
    if (t.status === 'completed') done++;
    else if (t.status === 'delay') delayed++;
    else if (t.status === 'hold') onHoldCount++;
    else if (t.status === 'in-progress' || t.status === 'todo') active++;
    else notStart++;
  }

  if (delayed > 0) return { key: 'late', label: `${delayed} Delayed` };
  if (onHoldCount > 0 && done < total) return { key: 'hold', label: `${onHoldCount} On Hold` };
  if (done === total) return { key: 'ok', label: 'All Done' };
  if (done + active >= Math.ceil(total * 0.6)) return { key: 'ok', label: 'On Track' };
  if (done + active > 0) return { key: 'risk', label: 'In Progress' };
  if (notStart === total) return { key: 'late', label: 'Not Started' };
  return { key: 'risk', label: 'At Risk' };
}

function teamFor(p: ProjectDoc, usersRepo: UserRepository): TeamMember[] {
  const seen = new Set<string>();
  const out: TeamMember[] = [];
  const tls = new Set(p.tls);
  const push = (name: string) => {
    const key = name.trim();
    if (!key || seen.has(key.toLowerCase())) return;
    seen.add(key.toLowerCase());
    const user = usersRepo.all().find((u) => u.name.trim().toLowerCase() === key.toLowerCase());
    const role: UserRole | 'unknown' = user?.role ?? (tls.has(name) ? 'tl' : 'user');
    out.push({ name: key, role, initials: initialsOf(key) });
  };
  for (const t of p.tls) push(t);
  for (const e of p.engineers) push(e);
  return out;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase();
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

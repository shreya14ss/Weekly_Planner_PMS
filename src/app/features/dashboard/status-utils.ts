import { ProjectDoc, ProjectStatus } from '@models/project';
import { ProjectWeekEntry } from '@models/week';

/**
 * Effective status = week entry override (if any) else the project's
 * baseline status. Legacy behaviour: PM sets a "canonical" status on
 * the project, weekly edits can override transiently.
 */
export function effectiveStatus(
  p: ProjectDoc,
  entry: ProjectWeekEntry | undefined,
): ProjectStatus {
  const patched = entry?.status;
  return patched !== undefined ? patched : p.status;
}

export function isDoneStatus(st: ProjectStatus | string): boolean {
  const s = (st || '').toLowerCase();
  return s.includes('completed') || s.includes('handed over') || s.includes('savt');
}

export function isActiveStatus(st: ProjectStatus | string): boolean {
  const s = (st || '').toLowerCase();
  return (
    s.includes('in progress') ||
    s.includes('testing') ||
    s.includes('configuration') ||
    s.includes('survey')
  );
}

export function isOnHold(st: ProjectStatus | string): boolean {
  return (st || '').toLowerCase().includes('on hold');
}

/** Consistent colour per status — used by donut + chips. */
export const STATUS_COLORS: Record<string, string> = {
  'In Progress': '#2563EB',
  'On Hold': '#D97706',
  'Not Started': '#6B7280',
  'Site Handed Over': '#059669',
  Completed: '#10B981',
  'SAVT Running': '#B45309',
  'Testing, Validation in Progress': '#7C3AED',
  Configuration: '#DC2626',
  'Site Survey in Progress': '#0369A1',
  '': '#9CA3AF',
};

export function statusColor(st: ProjectStatus | string): string {
  return STATUS_COLORS[st] ?? '#9CA3AF';
}

/**
 * Map a raw project-status label (e.g. "In Progress", "Site Handed Over")
 * to the dashboard's DashStatusFilter bucket. Returned as a plain string
 * so callers stay decoupled from the filter service's type. Returns
 * empty string when no natural bucket fits (e.g. "Not Set").
 */
export function dashFilterForStatusLabel(label: string): string {
  if (isDoneStatus(label)) return 'completed';
  if (isOnHold(label)) return 'hold';
  if (isActiveStatus(label)) return 'active';
  const l = (label || '').toLowerCase();
  if (l.includes('not started')) return 'not-started';
  return '';
}

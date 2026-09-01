import { AuthSession } from '@models/user';
import { ProjectDoc } from '@models/project';
import { WeekTask } from '@models/week';

/**
 * Case-insensitive contains/equals match — the legacy data mixes name
 * casings ("Mr. Sanjay" vs "sanjay") so we can't require strict equality.
 */
export function nameMatches(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false;
  const aa = a.trim().toLowerCase();
  const bb = b.trim().toLowerCase();
  return aa === bb || aa.includes(bb) || bb.includes(aa);
}

/**
 * Role-based edit permission on a project.
 *
 * - PM: everything
 * - TL: projects where they are listed in tls[] or engineers[]
 * - User: projects where they are listed in engineers[]
 *
 * (Task-level permissions are checked separately — a user can update the
 * status of a task assigned to them even on a project they don't own.)
 */
export function canEditProject(user: AuthSession | null, p: ProjectDoc): boolean {
  if (!user) return false;
  if (user.role === 'pm') return true;

  const engineerMatch = p.engineers.some((e) => nameMatches(e, user.name));
  if (user.role === 'tl') {
    return p.tls.some((t) => nameMatches(t, user.name)) || engineerMatch;
  }
  return engineerMatch;
}

/**
 * Visibility rule for the projects list.
 * PM sees everything; TL/User see projects they're associated with.
 */
export function isProjectVisible(user: AuthSession | null, p: ProjectDoc): boolean {
  if (!user) return false;
  if (user.role === 'pm') return true;
  return (
    p.tls.some((t) => nameMatches(t, user.name)) ||
    p.engineers.some((e) => nameMatches(e, user.name))
  );
}

/**
 * Task-level edit rule. Broader than project-level: a user can update
 * a task assigned to them even if they can't edit the project as a
 * whole. Only PMs/TLs (or engineers on the project) can add/remove
 * tasks — see `canManageTasks`.
 */
export function canEditTask(
  user: AuthSession | null,
  project: ProjectDoc,
  task: WeekTask,
): boolean {
  if (!user) return false;
  if (canEditProject(user, project)) return true;
  return (task.assignedTo ?? []).includes(user.id);
}

/** Add / remove / rename tasks — restricted to PM and TL on the project. */
export function canManageTasks(user: AuthSession | null, project: ProjectDoc): boolean {
  if (!user) return false;
  if (user.role === 'pm') return true;
  if (user.role === 'tl') {
    return (
      project.tls.some((t) => nameMatches(t, user.name)) ||
      project.engineers.some((e) => nameMatches(e, user.name))
    );
  }
  return false;
}

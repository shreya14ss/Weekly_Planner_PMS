import { AuthSession } from '@models/user';
import { ProjectDoc } from '@models/project';

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

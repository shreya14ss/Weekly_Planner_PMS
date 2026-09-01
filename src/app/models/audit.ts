import { BaseDoc } from './common';
import { UserRole } from './user';

export type AuditAction =
  | 'Login'
  | 'Logout'
  | 'Project Added'
  | 'Project Edited'
  | 'Project Deleted'
  | 'User Added'
  | 'User Edited'
  | 'User Deleted'
  | 'Task Added'
  | 'Task Deleted'
  | 'Task Name Changed'
  | 'Task Status Changed'
  | 'Task Assigned'
  | 'Task Unassigned'
  | 'Task Moved'
  | 'Form Updated'
  | 'Pending Task Reassigned';

/**
 * Audit doc — one per event. Deliberately small so a full history query is
 * cheap. Older entries can be pruned with a periodic compaction job.
 */
export interface AuditDoc extends BaseDoc {
  docType: 'audit';
  ts: string; // ISO
  userId: string;
  userName: string;
  role: UserRole;
  action: AuditAction;
  project?: string;
  detail?: string;
  oldVal?: string;
  newVal?: string;
}

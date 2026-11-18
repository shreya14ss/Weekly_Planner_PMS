import { BaseDoc, IsoDate } from './common';
import type { RecurrencePreset } from '@features/my-day/recurrence';

/**
 * Personal reminder owned by a single user. Reminders are strictly
 * personal — they are never shared across users. The `dueAt` field
 * drives both "Today" grouping and overdue detection.
 */
export interface ReminderDoc extends BaseDoc {
  docType: 'reminder';
  userId: string;
  text: string;
  /** Day the reminder is due. */
  dueAt: IsoDate;
  /** Optional 24-hour "HH:mm" time-of-day. When absent the reminder is a
   *  whole-day item and sorts after timed ones for the same day. */
  dueTime?: string;
  done: boolean;
  completedAt?: string;
  /** When set, completing the reminder rolls `dueAt` forward and leaves
   *  it open. A snapshot (one-off done copy) is saved for history. */
  recurrence?: RecurrencePreset;
  /** Display-only marker on history snapshots. Preserves the preset
   *  the completed instance came from so Caught Up can show "Daily"
   *  without turning the snapshot back into a live recurring template.
   *  Never read by scheduling or roll-forward logic. */
  sourceRecurrence?: RecurrencePreset;
  /** When a PM/TL delegates a reminder to someone else, `userId` is set
   *  to the recipient and `assignedBy` is the delegator's id. The My Day
   *  owner is always `userId`; the "From @X" badge reads `assignedBy`. */
  assignedBy?: string;
}

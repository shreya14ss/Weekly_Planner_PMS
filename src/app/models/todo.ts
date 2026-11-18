import { BaseDoc, IsoDate } from './common';
import type { RecurrencePreset } from '@features/my-day/recurrence';

/**
 * Personal todo — a lightweight task that is NOT tied to a project
 * or week. Owned by a single user. `dueAt` is optional so an
 * "inbox" item can exist without a date.
 */
export interface TodoDoc extends BaseDoc {
  docType: 'todo';
  userId: string;
  text: string;
  dueAt?: IsoDate;
  done: boolean;
  completedAt?: string;
  priority?: 'low' | 'normal' | 'high';
  /** When set + the todo has a `dueAt`, completing it rolls `dueAt`
   *  forward and leaves it open. A snapshot copy is saved for history. */
  recurrence?: RecurrencePreset;
  /** Display-only marker on history snapshots. Preserves the preset
   *  the completed instance came from so Caught Up can show "Daily"
   *  without turning the snapshot back into a live recurring template.
   *  Never read by scheduling or roll-forward logic. */
  sourceRecurrence?: RecurrencePreset;
  /** When a PM/TL delegates a todo to someone else, `userId` is set to
   *  the recipient and `assignedBy` is the delegator's id. The My Day
   *  owner is always `userId`; the "From @X" badge reads `assignedBy`. */
  assignedBy?: string;
}

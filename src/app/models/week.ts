import { BaseDoc, IsoDate } from './common';
import { ProjectStatus } from './project';

export type TaskStatus =
  | 'not-started'
  | 'todo'
  | 'in-progress'
  | 'completed'
  | 'hold'
  | 'delay';

/**
 * A single weekly task within a project's week entry.
 * User IDs (not names) are stored in `assignedTo` for referential integrity —
 * this is a small improvement over the legacy shape which mixed both.
 */
export interface WeekTask {
  id: string;
  name: string;
  status: TaskStatus;
  remark?: string;
  assignedTo: string[];
  taskDueDate?: IsoDate;

  /** Carry-forward provenance. */
  carriedFrom?: string;
  carriedWeek?: IsoDate;
  originalWeek?: IsoDate;
  accumulatedDelay?: number;
  moveHistory?: {
    from: IsoDate;
    to: IsoDate;
    movedAt: IsoDate;
    delayAtMove: number;
  }[];

  /** Task-level completion audit. */
  _completedBy?: string;
  _completedAt?: string;
}

/**
 * Per-project state within a single week.
 * `days` is a fixed 6-slot array (Mon–Sat). Each slot is a status + remark.
 */
export interface DaySlot {
  status: '' | 'done' | 'in-progress' | 'due' | 'blocked';
  remark: string;
}

export interface ProjectWeekEntry {
  tasks?: boolean[];
  days?: DaySlot[];
  targetDate?: IsoDate;
  weeklyTarget?: string;
  description?: string;
  status?: ProjectStatus;
  remarks?: string;
  weekTasks?: WeekTask[];
  _lastEditBy?: string;
  _lastEditAt?: string;
  _completedBy?: string;
  _completedAt?: string;
}

/**
 * One doc per week. `_id` is `week:YYYY-MM-DD` (always Monday) so PouchDB
 * range queries can grab a span of weeks with startkey/endkey.
 */
export interface WeekDoc extends BaseDoc {
  docType: 'week';
  /** Monday of the week (ISO date). Duplicated in `_id` for query convenience. */
  weekStart: IsoDate;
  /** Keyed by project id (the ProjectDoc._id). */
  entries: Record<string, ProjectWeekEntry>;
}

/** A pending (non-completed) task from a prior week, ready to carry-forward. */
export interface PendingTaskItem {
  week: IsoDate;
  projectId: string;
  task: WeekTask;
}

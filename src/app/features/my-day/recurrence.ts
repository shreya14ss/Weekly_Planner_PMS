import { addDays, addMonths, getDay, parseISO } from 'date-fns';

import { IsoDate } from '@models/common';
import { todayIso, toIsoDate } from '@shared/utils/date.util';

/**
 * A small, closed set of recurrence patterns — enough to cover the
 * common "every day", "every weekday", "weekly standup", "monthly
 * review" cases without introducing the full rrule grammar. Everything
 * else is derived from the item's current `dueAt`.
 */
export type RecurrencePreset =
  | 'none'
  | 'daily'
  | 'weekdays'
  | 'weekly'
  | 'monthly';

export interface RecurrenceOption {
  value: RecurrencePreset;
  label: string;
}

export const RECURRENCE_OPTIONS: RecurrenceOption[] = [
  { value: 'none',     label: 'No repeat' },
  { value: 'daily',    label: 'Every day' },
  { value: 'weekdays', label: 'Every weekday (Mon–Fri)' },
  { value: 'weekly',   label: 'Every week (same day)' },
  { value: 'monthly',  label: 'Every month (same date)' },
];

/**
 * Compute the next due date for a recurring item. The result is always
 * strictly in the future (> today) so completing a missed instance
 * doesn't immediately re-queue it for the same day.
 */
export function nextOccurrence(current: IsoDate, preset: RecurrencePreset): IsoDate {
  if (preset === 'none') return current;
  const today = todayIso();
  let next = rollOnce(current, preset);
  // Skip past any missed occurrences — keeps the item from showing up
  // instantly as "overdue" the moment you complete it.
  while (next <= today) next = rollOnce(next, preset);
  return next;
}

function rollOnce(iso: IsoDate, preset: RecurrencePreset): IsoDate {
  const date = parseISO(iso);
  switch (preset) {
    case 'daily':
      return toIsoDate(addDays(date, 1));
    case 'weekdays': {
      let n = addDays(date, 1);
      // Skip Sat (6) and Sun (0).
      while (getDay(n) === 0 || getDay(n) === 6) n = addDays(n, 1);
      return toIsoDate(n);
    }
    case 'weekly':
      return toIsoDate(addDays(date, 7));
    case 'monthly':
      return toIsoDate(addMonths(date, 1));
    case 'none':
    default:
      return iso;
  }
}

/** Short label suitable for a chip ("Every weekday", "Monthly", etc.). */
export function recurrenceLabel(preset: RecurrencePreset | undefined): string {
  switch (preset) {
    case 'daily':    return 'Every day';
    case 'weekdays': return 'Weekdays';
    case 'weekly':   return 'Weekly';
    case 'monthly':  return 'Monthly';
    default:         return '';
  }
}

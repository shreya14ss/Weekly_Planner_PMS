import { addDays, format, startOfWeek, parseISO, differenceInCalendarDays } from 'date-fns';

import { IsoDate } from '@models/common';

/**
 * All week keys are the Monday of that week. We use ISO week-start
 * (Monday = 1) so this matches the legacy HTML behaviour exactly.
 */
export const toIsoDate = (d: Date): IsoDate => format(d, 'yyyy-MM-dd');

export const parseIso = (s: IsoDate): Date => parseISO(s);

export const mondayOf = (d: Date | IsoDate): IsoDate => {
  const date = typeof d === 'string' ? parseIso(d) : d;
  return toIsoDate(startOfWeek(date, { weekStartsOn: 1 }));
};

export const currentWeekMonday = (): IsoDate => mondayOf(new Date());

export const addWeeks = (weekStart: IsoDate, n: number): IsoDate =>
  toIsoDate(addDays(parseIso(weekStart), n * 7));

export const daysBetween = (a: IsoDate, b: IsoDate): number =>
  differenceInCalendarDays(parseIso(b), parseIso(a));

export const weekDays = (weekStart: IsoDate): { label: string; date: string; iso: IsoDate }[] => {
  const start = parseIso(weekStart);
  return ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, i) => {
    const d = addDays(start, i);
    return { label, date: format(d, 'dd MMM'), iso: toIsoDate(d) };
  });
};

export const formatWeekRange = (weekStart: IsoDate): string => {
  const start = parseIso(weekStart);
  const end = addDays(start, 5);
  return `${format(start, 'dd MMM')} – ${format(end, 'dd MMM yyyy')}`;
};

import { BaseDoc, IsoDate } from './common';

/**
 * Personal meeting entry. Not synced with Outlook/Teams — the user
 * types these in (or paste them from a calendar invite). Sort key
 * across a day is `startTime` lexically ("09:00" < "14:30").
 */
export interface MeetingDoc extends BaseDoc {
  docType: 'meeting';
  userId: string;
  title: string;
  dateIso: IsoDate;
  /** 24-hour "HH:mm". */
  startTime: string;
  durationMin: number;
  location?: string;
  notes?: string;
  /** Free-text names — not foreign keys. */
  attendees?: string[];
}

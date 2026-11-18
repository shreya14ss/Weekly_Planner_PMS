import { Injectable } from '@angular/core';

import { DocType } from '@models/common';
import { ReminderDoc } from '@models/reminder';
import { nextOccurrence } from '@features/my-day/recurrence';
import { BaseRepository } from './base.repository';
import { idOf, shortId } from './id-utils';

@Injectable({ providedIn: 'root' })
export class ReminderRepository extends BaseRepository<ReminderDoc> {
  protected readonly type: DocType = 'reminder';

  async init(): Promise<void> {
    await this.bootstrap();
  }

  async create(
    input: Omit<ReminderDoc, '_id' | '_rev' | 'docType' | 'createdAt' | 'updatedAt'>,
  ): Promise<ReminderDoc> {
    const now = new Date().toISOString();
    return this.save({
      ...input,
      _id: idOf('reminder', shortId()),
      docType: 'reminder',
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(doc: ReminderDoc, patch: Partial<ReminderDoc>): Promise<ReminderDoc> {
    return this.save({ ...doc, ...patch, updatedAt: new Date().toISOString() });
  }

  /**
   * Mark a reminder as "done for this instance".
   *
   *  - Non-recurring: flipped to `done: true` with `completedAt` set.
   *  - Recurring: a one-off snapshot copy is written for history, and
   *    the live doc is rolled forward to its next occurrence (still
   *    open, same text, same recurrence).
   */
  async completeInstance(doc: ReminderDoc): Promise<void> {
    const nowIso = new Date().toISOString();
    const recurrence = doc.recurrence;
    if (!recurrence || recurrence === 'none') {
      await this.update(doc, { done: true, completedAt: nowIso });
      return;
    }

    // Snapshot the completed instance so "Caught up today" picks it up.
    // `sourceRecurrence` is a display-only tag so Caught Up can show
    // "↻ Daily" without turning the snapshot into a live template.
    await this.create({
      userId: doc.userId,
      text: doc.text,
      dueAt: doc.dueAt,
      dueTime: doc.dueTime,
      done: true,
      completedAt: nowIso,
      sourceRecurrence: recurrence,
    });

    // Roll the live reminder forward to its next occurrence.
    await this.update(doc, {
      dueAt: nextOccurrence(doc.dueAt, recurrence),
    });
  }
}

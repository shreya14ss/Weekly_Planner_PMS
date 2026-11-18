import { Injectable } from '@angular/core';

import { DocType } from '@models/common';
import { TodoDoc } from '@models/todo';
import { nextOccurrence } from '@features/my-day/recurrence';
import { BaseRepository } from './base.repository';
import { idOf, shortId } from './id-utils';

@Injectable({ providedIn: 'root' })
export class TodoRepository extends BaseRepository<TodoDoc> {
  protected readonly type: DocType = 'todo';

  async init(): Promise<void> {
    await this.bootstrap();
  }

  async create(
    input: Omit<TodoDoc, '_id' | '_rev' | 'docType' | 'createdAt' | 'updatedAt'>,
  ): Promise<TodoDoc> {
    const now = new Date().toISOString();
    return this.save({
      ...input,
      _id: idOf('todo', shortId()),
      docType: 'todo',
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(doc: TodoDoc, patch: Partial<TodoDoc>): Promise<TodoDoc> {
    return this.save({ ...doc, ...patch, updatedAt: new Date().toISOString() });
  }

  /**
   * Mark a todo as "done for this instance". Mirrors the reminder repo
   * — recurring todos get a snapshot + a rolled-forward live doc,
   * one-offs just flip `done: true`. Recurring with no `dueAt` is
   * treated as one-off (no sensible anchor to roll from).
   */
  async completeInstance(doc: TodoDoc): Promise<void> {
    const nowIso = new Date().toISOString();
    const recurrence = doc.recurrence;
    if (!recurrence || recurrence === 'none' || !doc.dueAt) {
      await this.update(doc, { done: true, completedAt: nowIso });
      return;
    }

    // Snapshot the completed instance. `sourceRecurrence` is a
    // display-only tag — Caught Up uses it to show "↻ Daily" so the
    // user knows this came from a series. The snapshot itself has no
    // live `recurrence`, so Reopen doesn't restart the series.
    await this.create({
      userId: doc.userId,
      text: doc.text,
      dueAt: doc.dueAt,
      priority: doc.priority,
      done: true,
      completedAt: nowIso,
      sourceRecurrence: recurrence,
    });

    await this.update(doc, {
      dueAt: nextOccurrence(doc.dueAt, recurrence),
    });
  }
}

import { Injectable, inject } from '@angular/core';

import { WeekDoc, ProjectWeekEntry } from '@models/week';
import { DocType, IsoDate } from '@models/common';
import { DatabaseService } from './database.service';
import { idOf } from './id-utils';

/**
 * Week docs are heavier and we don't want them all in memory at once, so
 * this repo is NOT signal-cached like the others. Consumers request the
 * week they're viewing and subscribe to that one via `watch(weekStart)`.
 *
 * Empty-write guard (mirrors §7 of the architecture doc): writing an empty
 * `entries` object is treated as a no-op unless the caller explicitly
 * opts in via `allowEmpty: true`. This prevents a race where a stale
 * listener from a previous week overwrites the current week with `{}`.
 */
@Injectable({ providedIn: 'root' })
export class WeekRepository {
  private readonly db = inject(DatabaseService);

  private readonly type: DocType = 'week';

  private weekId(weekStart: IsoDate): string {
    return idOf(this.type, weekStart);
  }

  async load(weekStart: IsoDate): Promise<WeekDoc | null> {
    return this.db.get<WeekDoc>(this.weekId(weekStart));
  }

  async save(
    weekStart: IsoDate,
    entries: Record<string, ProjectWeekEntry>,
    opts: { allowEmpty?: boolean } = {},
  ): Promise<WeekDoc> {
    const isEmpty = Object.keys(entries).length === 0;
    if (isEmpty && !opts.allowEmpty) {
      throw new Error(
        `[week] Refusing to write empty entries for ${weekStart}; pass allowEmpty:true to override.`,
      );
    }

    const existing = await this.load(weekStart);
    const now = new Date().toISOString();

    const doc: WeekDoc = {
      _id: this.weekId(weekStart),
      _rev: existing?._rev,
      docType: 'week',
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      weekStart,
      entries,
    };

    return this.db.put(doc);
  }

  async listAvailableWeeks(): Promise<IsoDate[]> {
    const docs = await this.db.allByType<WeekDoc>('week');
    return docs.map((d) => d.weekStart).sort();
  }
}

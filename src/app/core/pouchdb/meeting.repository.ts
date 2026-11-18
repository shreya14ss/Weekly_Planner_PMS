import { Injectable } from '@angular/core';

import { DocType } from '@models/common';
import { MeetingDoc } from '@models/meeting';
import { BaseRepository } from './base.repository';
import { idOf, shortId } from './id-utils';

@Injectable({ providedIn: 'root' })
export class MeetingRepository extends BaseRepository<MeetingDoc> {
  protected readonly type: DocType = 'meeting';

  async init(): Promise<void> {
    await this.bootstrap();
  }

  async create(
    input: Omit<MeetingDoc, '_id' | '_rev' | 'docType' | 'createdAt' | 'updatedAt'>,
  ): Promise<MeetingDoc> {
    const now = new Date().toISOString();
    return this.save({
      ...input,
      _id: idOf('meeting', shortId()),
      docType: 'meeting',
      createdAt: now,
      updatedAt: now,
    });
  }

  async update(doc: MeetingDoc, patch: Partial<MeetingDoc>): Promise<MeetingDoc> {
    return this.save({ ...doc, ...patch, updatedAt: new Date().toISOString() });
  }
}

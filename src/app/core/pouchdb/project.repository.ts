import { Injectable } from '@angular/core';

import { ProjectDoc } from '@models/project';
import { DocType } from '@models/common';
import { BaseRepository } from './base.repository';
import { idOf, shortId } from './id-utils';

@Injectable({ providedIn: 'root' })
export class ProjectRepository extends BaseRepository<ProjectDoc> {
  protected readonly type: DocType = 'project';

  async init(): Promise<void> {
    await this.bootstrap();
  }

  async create(
    input: Omit<ProjectDoc, '_id' | '_rev' | 'docType' | 'createdAt' | 'updatedAt'>,
  ): Promise<ProjectDoc> {
    const now = new Date().toISOString();
    return this.save({
      ...input,
      _id: idOf('project', shortId()),
      docType: 'project',
      createdAt: now,
      updatedAt: now,
    });
  }
}

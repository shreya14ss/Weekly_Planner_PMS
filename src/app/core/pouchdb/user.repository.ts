import { Injectable, computed } from '@angular/core';

import { UserDoc } from '@models/user';
import { DocType } from '@models/common';
import { BaseRepository } from './base.repository';
import { idOf, shortId } from './id-utils';

@Injectable({ providedIn: 'root' })
export class UserRepository extends BaseRepository<UserDoc> {
  protected readonly type: DocType = 'user';

  readonly sorted = computed(() => {
    const order = { pm: 0, tl: 1, user: 2 } as const;
    return [...this.all()].sort(
      (a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name),
    );
  });

  async init(): Promise<void> {
    await this.bootstrap();
    await this.ensurePMExists();
  }

  findByName(name: string): UserDoc | undefined {
    const needle = name.trim().toLowerCase();
    return this.all().find((u) => u.name.trim().toLowerCase() === needle);
  }

  authenticate(userId: string, pin: string): UserDoc | null {
    const user = this.get(userId);
    if (!user) return null;
    return user.pin === pin ? user : null;
  }

  async create(input: Omit<UserDoc, '_id' | '_rev' | 'docType' | 'createdAt' | 'updatedAt'>): Promise<UserDoc> {
    const id = idOf('user', shortId());
    const now = new Date().toISOString();
    return this.save({ ...input, _id: id, docType: 'user', createdAt: now, updatedAt: now });
  }

  /**
   * Guarantee a Project Manager exists (default PIN 0000) so the app is
   * never locked out. The legacy file did the same on boot.
   */
  private async ensurePMExists(): Promise<void> {
    if (this.all().some((u) => u.role === 'pm')) return;
    const now = new Date().toISOString();
    await this.save({
      _id: idOf('user', 'pm'),
      docType: 'user',
      createdAt: now,
      updatedAt: now,
      name: 'Project Manager',
      role: 'pm',
      pin: '0000',
    });
  }
}

import { Injectable, inject } from '@angular/core';

import { AuditDoc, AuditAction } from '@models/audit';
import { DocType } from '@models/common';
import { UserRole } from '@models/user';
import { DatabaseService } from './database.service';
import { idOf, shortId } from './id-utils';

/**
 * Fire-and-forget audit log. Reads are only on the History screen so we
 * don't keep everything in memory — the History screen loads a filtered
 * page on demand.
 */
@Injectable({ providedIn: 'root' })
export class AuditRepository {
  private readonly db = inject(DatabaseService);
  private readonly type: DocType = 'audit';

  async record(entry: {
    userId: string;
    userName: string;
    role: UserRole;
    action: AuditAction;
    project?: string;
    detail?: string;
    oldVal?: string;
    newVal?: string;
  }): Promise<void> {
    const now = new Date().toISOString();
    const doc: AuditDoc = {
      _id: idOf(this.type, `${now}-${shortId()}`),
      docType: 'audit',
      createdAt: now,
      updatedAt: now,
      ts: now,
      ...entry,
    };
    try {
      await this.db.put(doc);
    } catch (err) {
      // Audit failures must never break the primary action.
      console.warn('[audit] failed to record', err);
    }
  }

  async recent(limit = 200): Promise<AuditDoc[]> {
    const docs = await this.db.allByType<AuditDoc>(this.type);
    return docs.sort((a, b) => b.ts.localeCompare(a.ts)).slice(0, limit);
  }
}

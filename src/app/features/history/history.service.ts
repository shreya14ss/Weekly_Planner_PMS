import { Injectable, computed, inject, signal } from '@angular/core';

import { AuditRepository } from '@core/pouchdb/audit.repository';
import { DatabaseService } from '@core/pouchdb/database.service';
import { UserRepository } from '@core/pouchdb/user.repository';
import { AuditDoc, AuditAction } from '@models/audit';

/**
 * Loads and filters the audit log for the History page. Kept
 * providedIn: root so opening the page a second time doesn't re-fetch
 * from PouchDB unnecessarily — the signal stays populated.
 */
@Injectable({ providedIn: 'root' })
export class HistoryService {
  private readonly audit = inject(AuditRepository);
  private readonly users = inject(UserRepository);
  private readonly db = inject(DatabaseService);

  private readonly _entries = signal<AuditDoc[]>([]);
  readonly loaded = signal(false);
  readonly loading = signal(false);

  readonly userFilter = signal<'all' | string>('all');
  readonly actionFilter = signal<'all' | AuditAction>('all');
  /** 0 = all time, else N days */
  readonly daysFilter = signal<number>(30);

  readonly entries = this._entries.asReadonly();

  readonly userOptions = computed(() => {
    const set = new Map<string, string>();
    for (const e of this._entries()) if (e.userId) set.set(e.userId, e.userName);
    return Array.from(set, ([id, name]) => ({ id, name })).sort((a, b) =>
      a.name.localeCompare(b.name),
    );
  });

  readonly actionOptions: AuditAction[] = [
    'Login',
    'Logout',
    'Project Added',
    'Project Edited',
    'Project Deleted',
    'User Added',
    'User Edited',
    'User Deleted',
    'Task Added',
    'Task Deleted',
    'Task Name Changed',
    'Task Status Changed',
    'Task Assigned',
    'Task Unassigned',
    'Task Moved',
    'Form Updated',
    'Pending Task Reassigned',
  ];

  readonly filtered = computed<AuditDoc[]>(() => {
    const user = this.userFilter();
    const action = this.actionFilter();
    const days = this.daysFilter();
    const cutoff = days > 0 ? Date.now() - days * 86400000 : 0;

    return this._entries().filter((e) => {
      if (user !== 'all' && e.userId !== user) return false;
      if (action !== 'all' && e.action !== action) return false;
      if (cutoff > 0) {
        const ts = Date.parse(e.ts);
        if (!isNaN(ts) && ts < cutoff) return false;
      }
      return true;
    });
  });

  async load(limit = 500): Promise<void> {
    this.loading.set(true);
    try {
      this._entries.set(await this.audit.recent(limit));
      this.loaded.set(true);
    } finally {
      this.loading.set(false);
    }
  }

  async clearAll(): Promise<void> {
    // Fetch every audit doc and delete — no bulk endpoint on our
    // repo, but audit isn't massive.
    const docs = await this.db.allByType<AuditDoc>('audit');
    for (const d of docs) await this.db.remove(d);
    this._entries.set([]);
  }

  reset(): void {
    this.userFilter.set('all');
    this.actionFilter.set('all');
    this.daysFilter.set(30);
  }
}

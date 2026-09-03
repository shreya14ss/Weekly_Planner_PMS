import { Injectable, signal, DestroyRef, inject } from '@angular/core';
import { Observable, Subject } from 'rxjs';

import { AppSettingsService } from '@core/config/app-settings.service';
import { BaseDoc, DocType } from '@models/common';
import { PouchDB } from './pouchdb-loader';
import { rangeForType } from './id-utils';

export type SyncStatus = 'idle' | 'connecting' | 'active' | 'paused' | 'error' | 'offline';

/**
 * Owns the single PouchDB instance and its optional remote CouchDB
 * replication. Repositories consume this service — they never new up
 * their own PouchDB.
 *
 * Design notes:
 *  - One local DB with a `docType` discriminator (see id-utils). This is
 *    simpler than multi-DB for our access patterns and lets us do one
 *    replication channel instead of N.
 *  - Live bidirectional sync is idempotent and can be re-configured at
 *    runtime (`configureRemote` cleans up the old handler first).
 *  - The change feed is exposed as an RxJS stream so repositories can
 *    convert it into signals however they like.
 */
@Injectable({ providedIn: 'root' })
export class DatabaseService {
  private readonly destroyRef = inject(DestroyRef);
  private readonly settings = inject(AppSettingsService);

  private local!: PouchDB.Database<BaseDoc>;
  private remote?: PouchDB.Database<BaseDoc>;
  private syncHandler?: PouchDB.Replication.Sync<BaseDoc>;

  private readonly changes$ = new Subject<PouchDB.Core.ChangesResponseChange<BaseDoc>>();
  private changesHandler?: PouchDB.Core.Changes<BaseDoc>;

  readonly syncStatus = signal<SyncStatus>('idle');
  readonly lastSyncError = signal<string | null>(null);

  /**
   * Called once from a bootstrap provider. Safe to call repeatedly (no-op
   * if already initialised).
   */
  async init(): Promise<void> {
    if (this.local) return;

    this.local = new PouchDB<BaseDoc>(this.settings.couch.LocalDbPrefix, {
      auto_compaction: true,
    });

    // Mango indexes for our hot paths. Creation is idempotent.
    await this.local.createIndex({ index: { fields: ['docType'] } });
    await this.local.createIndex({ index: { fields: ['docType', 'updatedAt'] } });

    this.changesHandler = this.local
      .changes({ since: 'now', live: true, include_docs: true })
      .on('change', (c) => this.changes$.next(c))
      .on('error', (err) => console.error('[db] changes error', err));

    this.destroyRef.onDestroy(() => this.dispose());

    const url = this.settings.couchUrl;
    if (url) {
      await this.configureRemote(url, this.settings.couch.LiveSync);
    }
  }

  /** Reactive change feed for repositories to consume. */
  changes(): Observable<PouchDB.Core.ChangesResponseChange<BaseDoc>> {
    return this.changes$.asObservable();
  }

  async get<T extends BaseDoc>(id: string): Promise<T | null> {
    try {
      return (await this.local.get(id)) as unknown as T;
    } catch (err: unknown) {
      if ((err as { status?: number }).status === 404) return null;
      throw err;
    }
  }

  /**
   * Upsert. If `doc._rev` is missing, we look up the existing rev first.
   * This avoids the classic "document update conflict" foot-gun without
   * forcing every caller to remember to fetch first.
   */
  async put<T extends BaseDoc>(doc: T): Promise<T> {
    const now = new Date().toISOString();
    const payload: T = {
      ...doc,
      createdAt: doc.createdAt ?? now,
      updatedAt: now,
    };

    if (!payload._rev) {
      const existing = await this.get<T>(payload._id);
      if (existing) payload._rev = existing._rev;
    }

    const res = await this.local.put(payload);
    return { ...payload, _rev: res.rev };
  }

  async remove(doc: BaseDoc): Promise<void> {
    if (!doc._rev) {
      const latest = await this.get(doc._id);
      if (!latest) return;
      doc._rev = latest._rev;
    }
    await this.local.remove(doc._id, doc._rev!);
  }

  /**
   * All docs of a given type via prefix range scan — much faster than
   * `find({ docType })` for large sets because it doesn't walk an index.
   */
  async allByType<T extends BaseDoc>(type: DocType): Promise<T[]> {
    const range = rangeForType(type);
    const res = await this.local.allDocs<T>({ include_docs: true, ...range });
    return res.rows
      .map((r) => r.doc)
      .filter((d): d is T & PouchDB.Core.IdMeta & PouchDB.Core.GetMeta => !!d);
  }

  async find<T extends BaseDoc>(selector: PouchDB.Find.Selector): Promise<T[]> {
    const res = await this.local.find({ selector });
    return res.docs as unknown as T[];
  }

  /**
   * (Re)configure remote replication. Passing an empty URL disconnects.
   */
  async configureRemote(url: string, live: boolean): Promise<void> {
    await this.disconnectRemote();

    if (!url) return;

    this.syncStatus.set('connecting');
    this.remote = new PouchDB<BaseDoc>(url, {
      skip_setup: true,
      // Send the CouchDB AuthSession cookie set by /_session on every
      // replication request. Without this, PouchDB fetches are anonymous
      // and CouchDB (with require_valid_user=true) returns 401.
      fetch: (input, init) =>
        PouchDB.fetch(input, { ...(init ?? {}), credentials: 'include' }),
    });

    this.syncHandler = this.local
      .sync(this.remote, { live, retry: live })
      .on('change', () => this.syncStatus.set('active'))
      .on('paused', (err) => {
        this.syncStatus.set(err ? 'offline' : 'paused');
        if (err) this.lastSyncError.set(String((err as Error)?.message ?? err));
      })
      .on('active', () => this.syncStatus.set('active'))
      .on('denied', (err) => {
        this.syncStatus.set('error');
        this.lastSyncError.set(String((err as Error)?.message ?? err));
      })
      .on('error', (err) => {
        this.syncStatus.set('error');
        this.lastSyncError.set(String((err as Error)?.message ?? err));
      });
  }

  async disconnectRemote(): Promise<void> {
    if (this.syncHandler) {
      this.syncHandler.cancel();
      this.syncHandler = undefined;
    }
    if (this.remote) {
      await this.remote.close();
      this.remote = undefined;
    }
    this.syncStatus.set('idle');
    this.lastSyncError.set(null);
  }

  /** Danger: wipes the local database. Requires PM-level UI confirmation. */
  async destroyLocal(): Promise<void> {
    await this.dispose();
    await this.local.destroy();
  }

  private async dispose(): Promise<void> {
    this.changesHandler?.cancel();
    this.changesHandler = undefined;
    await this.disconnectRemote();
  }
}

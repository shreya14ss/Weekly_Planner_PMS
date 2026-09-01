import { DestroyRef, Signal, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

import { BaseDoc, DocType } from '@models/common';
import { DatabaseService } from './database.service';

/**
 * Reactive repository. Subclasses declare their DocType and get:
 *  - `all` — a signal of every doc of that type, kept fresh via the
 *    PouchDB change feed
 *  - `byId` — indexed accessor
 *  - CRUD wrappers that keep the local cache in sync
 *
 * The initial load is fire-and-forget; templates can key off `ready` if
 * they need to distinguish "no data yet" from "no docs exist".
 */
export abstract class BaseRepository<T extends BaseDoc> {
  protected readonly db = inject(DatabaseService);
  protected readonly destroyRef = inject(DestroyRef);

  protected abstract readonly type: DocType;

  private readonly items = signal<T[]>([]);
  private readonly _ready = signal(false);

  readonly all: Signal<T[]> = this.items.asReadonly();
  readonly ready: Signal<boolean> = this._ready.asReadonly();
  readonly byId = computed(() => new Map(this.items().map((d) => [d._id, d])));

  protected async bootstrap(): Promise<void> {
    const docs = await this.db.allByType<T>(this.type);
    this.items.set(docs);
    this._ready.set(true);

    this.db
      .changes()
      .pipe(
        filter((c) => c.id.startsWith(`${this.type}:`)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((c) => this.applyChange(c));
  }

  private applyChange(c: PouchDB.Core.ChangesResponseChange<BaseDoc>): void {
    const list = this.items();
    const idx = list.findIndex((d) => d._id === c.id);

    if (c.deleted) {
      if (idx >= 0) this.items.set(list.filter((_, i) => i !== idx));
      return;
    }

    const doc = c.doc as unknown as T | undefined;
    if (!doc) return;

    const next = idx >= 0 ? [...list.slice(0, idx), doc, ...list.slice(idx + 1)] : [...list, doc];
    this.items.set(next);
  }

  async save(doc: T): Promise<T> {
    const saved = await this.db.put(doc);
    // Change feed will also fire; we update eagerly for zero-flicker UX.
    const list = this.items();
    const idx = list.findIndex((d) => d._id === saved._id);
    this.items.set(idx >= 0 ? [...list.slice(0, idx), saved, ...list.slice(idx + 1)] : [...list, saved]);
    return saved;
  }

  async remove(doc: T): Promise<void> {
    await this.db.remove(doc);
    this.items.set(this.items().filter((d) => d._id !== doc._id));
  }

  get(id: string): T | undefined {
    return this.byId().get(id);
  }
}

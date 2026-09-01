import { Injectable, inject, signal } from '@angular/core';

import { DatabaseService } from '@core/pouchdb/database.service';
import { ProjectRepository } from '@core/pouchdb/project.repository';
import { UserRepository } from '@core/pouchdb/user.repository';
import { WeekRepository } from '@core/pouchdb/week.repository';
import { AuditRepository } from '@core/pouchdb/audit.repository';
import { AuthService } from '@core/services/auth.service';
import { WeekStateService } from '@core/services/week-state.service';
import { AuditDoc } from '@models/audit';
import { ProjectDoc } from '@models/project';
import { UserDoc } from '@models/user';
import { WeekDoc } from '@models/week';

/**
 * Cross-cutting UI actions triggered from the persistent toolbar
 * (Add Project modal, Recovery dialog, JSON backup, Clear All).
 *
 * Modal *state* lives here so the toolbar can trigger from anywhere
 * while the modal itself is mounted once in the AppShell.
 */
@Injectable({ providedIn: 'root' })
export class AppActionsService {
  private readonly db = inject(DatabaseService);
  private readonly projects = inject(ProjectRepository);
  private readonly users = inject(UserRepository);
  private readonly weekRepo = inject(WeekRepository);
  private readonly audit = inject(AuditRepository);
  private readonly auth = inject(AuthService);
  private readonly weekState = inject(WeekStateService);

  readonly addProjectOpen = signal(false);
  readonly editingProject = signal<ProjectDoc | null>(null);
  readonly recoveryOpen = signal(false);

  openAddProject(): void {
    this.editingProject.set(null);
    this.addProjectOpen.set(true);
  }

  openEditProject(project: ProjectDoc): void {
    this.editingProject.set(project);
    this.addProjectOpen.set(true);
  }

  openRecovery(): void {
    this.recoveryOpen.set(true);
  }

  /**
   * JSON backup — the Angular equivalent of legacy "Save & Export File".
   * A single self-contained file that can be re-imported via /app/import
   * (using the Firebase RTDB path, since we already mapped that shape).
   */
  async exportBackup(): Promise<void> {
    const [projects, users, weeks, audit] = await Promise.all([
      this.db.allByType<ProjectDoc>('project'),
      this.db.allByType<UserDoc>('user'),
      this.db.allByType<WeekDoc>('week'),
      this.db.allByType<AuditDoc>('audit'),
    ]);

    // Match the legacy Firebase RTDB export shape so the same importer
    // path handles it on the other side.
    const weeksMap: Record<string, Record<string, unknown>> = {};
    for (const w of weeks) weeksMap[w.weekStart] = w.entries;

    const payload = {
      _v: new Date().toISOString(),
      projects: projects.map((p) => this.stripPouchMeta(p, p._id)),
      users: users.map((u) => this.stripPouchMeta(u, u._id)),
      weeks: weeksMap,
      audit: audit.map((a) => this.stripPouchMeta(a, a._id)),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const stamp = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `RBH_Backup_${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Nuke everything except the seeded PM. The empty-write guard on
   * WeekRepository doesn't protect us here — that's for accidental
   * empty writes, not deliberate wipes. Confirm at the UI layer.
   */
  async clearAllData(): Promise<void> {
    if (this.auth.role() !== 'pm') throw new Error('Only PM can clear all data.');

    for (const type of ['project', 'week', 'audit'] as const) {
      const docs = await this.db.allByType(type);
      for (const doc of docs) await this.db.remove(doc);
    }
    // Users: keep the seeded PM so the app doesn't lock itself out.
    const users = await this.db.allByType<UserDoc>('user');
    for (const u of users) {
      if (u._id === 'user:pm') continue;
      await this.db.remove(u);
    }

    await Promise.all([this.projects.init(), this.users.init(), this.weekState.init()]);

    const currentUser = this.auth.currentUser();
    if (currentUser) {
      this.audit.record({
        userId: currentUser.id,
        userName: currentUser.name,
        role: currentUser.role,
        action: 'Form Updated',
        detail: 'CLEAR ALL DATA — every project / week / audit doc removed',
      });
    }
  }

  /**
   * Convert a PouchDB doc into a plain-shape record that matches the
   * legacy Firebase RTDB export (which used `id`, not `_id`, and had
   * no `_rev`). Same importer path already understands this shape.
   */
  private stripPouchMeta<T extends { _id: string; _rev?: string }>(
    doc: T,
    idOverride: string,
  ): Record<string, unknown> {
    const rest: Record<string, unknown> = { ...(doc as Record<string, unknown>) };
    delete rest['_id'];
    delete rest['_rev'];
    return { ...rest, id: idOverride };
  }
}

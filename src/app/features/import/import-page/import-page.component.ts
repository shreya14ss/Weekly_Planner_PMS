import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import * as XLSX from 'xlsx';

import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { SelectButtonModule } from 'primeng/selectbutton';
import { FormsModule } from '@angular/forms';

import {
  ImportPreview,
  ImportResult,
  MergeMode,
  MigrationService,
} from '@core/services/migration.service';

interface FirebasePayload {
  preview: ImportPreview;
  data: Parameters<MigrationService['importFirebaseJson']>[0];
}

interface ExcelPayload {
  preview: ImportPreview;
  rows: string[][];
}

type Kind = 'firebase' | 'projects' | 'users';

/**
 * PM-only data-import page. Three cards, one per source:
 *  - Firebase RTDB JSON export (richest — projects + users + weeks + audit)
 *  - Projects Excel
 *  - Users Excel
 *
 * Each card parses on file select, previews counts + warnings, then
 * commits with a merge/replace toggle.
 */
@Component({
  selector: 'app-import-page',
  standalone: true,
  imports: [
    FormsModule,
    CardModule,
    ButtonModule,
    MessageModule,
    TagModule,
    SelectButtonModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './import-page.component.html',
  styleUrl: './import-page.component.scss',
})
export class ImportPageComponent {
  private readonly migration = inject(MigrationService);

  protected readonly mergeOptions = [
    { label: 'Merge (safe)', value: 'merge' },
    { label: 'Replace all', value: 'replace' },
  ];

  protected readonly firebase = signal<FirebasePayload | null>(null);
  protected readonly firebaseMode = signal<MergeMode>('merge');

  protected readonly projectsXlsx = signal<ExcelPayload | null>(null);
  protected readonly projectsMode = signal<MergeMode>('merge');

  protected readonly usersXlsx = signal<ExcelPayload | null>(null);
  protected readonly usersMode = signal<MergeMode>('merge');

  protected readonly busy = signal<Kind | null>(null);
  protected readonly result = signal<{ kind: Kind; result: ImportResult } | null>(null);
  protected readonly error = signal<string | null>(null);

  protected readonly hasResult = computed(() => this.result() !== null);

  async onFirebaseFile(file: File | null): Promise<void> {
    this.error.set(null);
    this.firebase.set(null);
    if (!file) return;
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const parsed = this.migration.parseFirebaseJson(json);
      this.firebase.set({ preview: parsed.preview, data: parsed.data });
    } catch (err) {
      this.error.set('Firebase JSON: ' + (err as Error).message);
    }
  }

  async onProjectsFile(file: File | null): Promise<void> {
    this.error.set(null);
    this.projectsXlsx.set(null);
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const parsed = this.migration.parseProjectsExcel(wb);
      this.projectsXlsx.set({ preview: parsed.preview, rows: parsed.rows });
    } catch (err) {
      this.error.set('Projects Excel: ' + (err as Error).message);
    }
  }

  async onUsersFile(file: File | null): Promise<void> {
    this.error.set(null);
    this.usersXlsx.set(null);
    if (!file) return;
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const parsed = this.migration.parseUsersExcel(wb);
      this.usersXlsx.set({ preview: parsed.preview, rows: parsed.rows });
    } catch (err) {
      this.error.set('Users Excel: ' + (err as Error).message);
    }
  }

  async runFirebase(): Promise<void> {
    const p = this.firebase();
    if (!p) return;
    if (this.firebaseMode() === 'replace' && !confirm(this.replaceWarning())) return;
    await this.run('firebase', () => this.migration.importFirebaseJson(p.data, this.firebaseMode()));
  }

  async runProjectsXlsx(): Promise<void> {
    const p = this.projectsXlsx();
    if (!p) return;
    if (this.projectsMode() === 'replace' && !confirm(this.replaceWarning('projects'))) return;
    await this.run('projects', () => this.migration.importProjectsExcel(p.rows, this.projectsMode()));
  }

  async runUsersXlsx(): Promise<void> {
    const p = this.usersXlsx();
    if (!p) return;
    if (this.usersMode() === 'replace' && !confirm(this.replaceWarning('users'))) return;
    await this.run('users', () => this.migration.importUsersExcel(p.rows, this.usersMode()));
  }

  private async run(kind: Kind, fn: () => Promise<ImportResult>): Promise<void> {
    this.busy.set(kind);
    this.result.set(null);
    this.error.set(null);
    try {
      const res = await fn();
      this.result.set({ kind, result: res });
    } catch (err) {
      this.error.set((err as Error).message);
    } finally {
      this.busy.set(null);
    }
  }

  private replaceWarning(what = 'the affected data'): string {
    return `Replace All will DELETE ${what} in this browser before importing. Continue?`;
  }
}

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  model,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';

import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { AutoCompleteModule } from 'primeng/autocomplete';
import { MultiSelectModule } from 'primeng/multiselect';
import { SelectModule } from 'primeng/select';
import { TextareaModule } from 'primeng/textarea';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';

import { PROJECT_STATUSES, ProjectDoc, ProjectStatus } from '@models/project';
import { ProjectRepository } from '@core/pouchdb/project.repository';
import { UserRepository } from '@core/pouchdb/user.repository';
import { AuditRepository } from '@core/pouchdb/audit.repository';
import { AuthService } from '@core/services/auth.service';

/**
 * Reusable "Add / Edit Project" dialog.
 *
 * Bind `visible` two-way from the parent. Pass an `editing` project doc
 * to switch into edit mode; leave it null for add. The `saved` output
 * fires with the persisted doc once the user confirms.
 */
@Component({
  selector: 'app-add-project-modal',
  standalone: true,
  imports: [
    FormsModule,
    DialogModule,
    InputTextModule,
    AutoCompleteModule,
    MultiSelectModule,
    SelectModule,
    TextareaModule,
    ButtonModule,
    MessageModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './add-project-modal.component.html',
})
export class AddProjectModalComponent {
  private readonly projects = inject(ProjectRepository);
  private readonly users = inject(UserRepository);
  private readonly audit = inject(AuditRepository);
  private readonly auth = inject(AuthService);

  readonly visible = model.required<boolean>();
  readonly editing = input<ProjectDoc | null>(null);
  readonly saved = output<ProjectDoc>();

  readonly client = signal('');
  readonly name = signal('');
  readonly engineers = signal<string[]>([]);
  readonly tls = signal<string[]>([]);
  readonly status = signal<ProjectStatus>('');
  readonly desc = signal('');
  readonly remarks = signal('');
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  readonly statusOptions = PROJECT_STATUSES.filter((s) => s !== '').map((s) => ({
    label: s,
    value: s,
  }));

  readonly clientSuggestions = signal<string[]>([]);

  /** All known clients across projects — used to autocomplete the client field. */
  private readonly allClients = computed(() =>
    Array.from(new Set(this.projects.all().map((p) => p.client).filter(Boolean))).sort(),
  );

  /** TL/PM users available for the TL multi-select. */
  readonly tlOptions = computed(() =>
    this.users.all()
      .filter((u) => u.role === 'tl' || u.role === 'pm')
      .map((u) => ({ label: u.name, value: u.name, role: u.role })),
  );

  readonly isEdit = computed(() => this.editing() !== null);
  readonly title = computed(() => (this.isEdit() ? 'Edit Project' : 'Add New Project'));

  constructor() {
    // Sync form fields whenever the dialog opens or the editing target
    // changes. Reset to blanks on close so re-opens don't leak state.
    effect(() => {
      if (!this.visible()) return;
      const p = this.editing();
      this.client.set(p?.client ?? '');
      this.name.set(p?.name === '—' ? '' : (p?.name ?? ''));
      this.engineers.set(p?.engineers ? [...p.engineers] : []);
      this.tls.set(p?.tls ? [...p.tls] : []);
      this.status.set(p?.status ?? '');
      this.desc.set(p?.desc ?? '');
      this.remarks.set(p?.remarks ?? '');
      this.error.set(null);
      this.submitting.set(false);
    });
  }

  searchClients(event: { query: string }): void {
    const q = event.query.trim().toLowerCase();
    this.clientSuggestions.set(
      this.allClients().filter((c) => c.toLowerCase().includes(q)),
    );
  }

  /** Comma-separated engineer entry — converts the string to a trimmed list. */
  onEngineersInput(raw: string): void {
    this.engineers.set(
      raw
        .split(',')
        .map((e) => e.trim())
        .filter(Boolean),
    );
  }

  async save(): Promise<void> {
    this.error.set(null);

    const client = this.client().trim();
    if (!client) {
      this.error.set('Client is required.');
      return;
    }

    this.submitting.set(true);
    try {
      // Ensure every selected TL is also present in engineers (they can
      // do engineer-level work on their own project).
      const engs = new Set([...this.engineers(), ...this.tls()]);

      const payload = {
        client,
        name: this.name().trim() || '—',
        engineers: Array.from(engs),
        tls: [...this.tls()],
        status: this.status(),
        desc: this.desc().trim() || undefined,
        remarks: this.remarks().trim() || undefined,
      };

      const existing = this.editing();
      const saved = existing
        ? await this.projects.save({ ...existing, ...payload })
        : await this.projects.create({ ...payload, desc: payload.desc ?? '', remarks: payload.remarks ?? '' });

      const user = this.auth.currentUser();
      if (user) {
        this.audit.record({
          userId: user.id,
          userName: user.name,
          role: user.role,
          action: existing ? 'Project Edited' : 'Project Added',
          project: saved.name,
          detail: `${saved.client} · ${saved.name}`,
        });
      }

      this.saved.emit(saved);
      this.visible.set(false);
    } catch (err) {
      this.error.set((err as Error).message ?? 'Failed to save project.');
    } finally {
      this.submitting.set(false);
    }
  }

  cancel(): void {
    this.visible.set(false);
  }
}

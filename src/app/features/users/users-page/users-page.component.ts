import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

import { UserRepository } from '@core/pouchdb/user.repository';
import { ProjectRepository } from '@core/pouchdb/project.repository';
import { AuthService } from '@core/services/auth.service';
import { MigrationService } from '@core/services/migration.service';
import { AuditRepository } from '@core/pouchdb/audit.repository';
import { UserDoc, UserRole } from '@models/user';
import { nameMatches } from '@core/services/project-permissions';
import { UserFormModalComponent, UserModalMode } from '@features/users/user-form-modal/user-form-modal.component';

interface RoleFilterOption {
  value: 'all' | UserRole;
  label: string;
  icon?: string;
  cls: string;
}

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [
    FormsModule,
    TableModule,
    TagModule,
    CardModule,
    ButtonModule,
    TooltipModule,
    ConfirmDialogModule,
    UserFormModalComponent,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './users-page.component.html',
  styleUrl: './users-page.component.scss',
})
export class UsersPageComponent {
  protected readonly users = inject(UserRepository);
  private readonly projects = inject(ProjectRepository);
  private readonly auth = inject(AuthService);
  private readonly migration = inject(MigrationService);
  private readonly audit = inject(AuditRepository);
  private readonly confirm = inject(ConfirmationService);

  protected readonly roleFilter = signal<'all' | UserRole>('all');
  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<UserDoc | null>(null);
  protected readonly modalMode = signal<UserModalMode>('add');

  protected readonly roleFilters: RoleFilterOption[] = [
    { value: 'all', label: 'All Users', cls: 'rf-all' },
    { value: 'pm', label: 'PM', icon: 'pi-star-fill', cls: 'rf-pm' },
    { value: 'tl', label: 'TL', icon: 'pi-users', cls: 'rf-tl' },
    { value: 'user', label: 'User', icon: 'pi-user', cls: 'rf-user' },
  ];

  protected readonly filtered = computed(() => {
    const filter = this.roleFilter();
    return this.users.sorted().filter((u) => filter === 'all' || u.role === filter);
  });

  /**
   * Count of projects each user is associated with. Computed once
   * per render so we don't recount on every row.
   */
  protected readonly projectCounts = computed(() => {
    const map = new Map<string, number>();
    for (const p of this.projects.all()) {
      const names = new Set<string>([...p.tls, ...p.engineers]);
      for (const name of names) {
        // Look up matching user by name (case-insensitive)
        const user = this.users.all().find((u) => nameMatches(u.name, name));
        if (!user) continue;
        map.set(user._id, (map.get(user._id) ?? 0) + 1);
      }
    }
    return map;
  });

  /** Text description of a user's TL assignments — same shape as legacy. */
  tlProjectsFor(user: UserDoc): string {
    const list = this.projects
      .all()
      .filter((p) => p.tls.some((tl) => nameMatches(tl, user.name)))
      .map((p) => (p.name === '—' ? p.client : p.name));
    if (list.length === 0) return '—';
    return list.slice(0, 2).join(', ') + (list.length > 2 ? ` +${list.length - 2}` : '');
  }

  protected initialsOf(name: string): string {
    return name
      .split(/\s+/)
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase() || '?';
  }

  protected avatarBg(role: UserRole): string {
    if (role === 'pm') return '#D97706';
    if (role === 'tl') return '#2563EB';
    return '#6B7280';
  }

  protected roleTag(role: UserRole): { severity: 'warn' | 'info' | 'secondary'; label: string } {
    if (role === 'pm') return { severity: 'warn', label: 'PM' };
    if (role === 'tl') return { severity: 'info', label: 'TL' };
    return { severity: 'secondary', label: 'User' };
  }

  openAdd(): void {
    this.editing.set(null);
    this.modalMode.set('add');
    this.modalOpen.set(true);
  }

  openEdit(user: UserDoc): void {
    this.editing.set(user);
    this.modalMode.set('edit');
    this.modalOpen.set(true);
  }

  canDelete(user: UserDoc): boolean {
    if (this.auth.role() !== 'pm') return false;
    if (user._id === 'user:pm') return false; // preserve seeded PM
    if (user._id === this.auth.currentUser()?.id) return false; // can't delete self
    return true;
  }

  delete(user: UserDoc, event: MouseEvent): void {
    this.confirm.confirm({
      target: event.target as EventTarget,
      message: `Remove user "${user.name}"? This cannot be undone.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Remove',
      acceptButtonStyleClass: 'p-button-danger',
      rejectLabel: 'Cancel',
      accept: async () => {
        await this.users.remove(user);
        const currentUser = this.auth.currentUser();
        if (currentUser) {
          this.audit.record({
            userId: currentUser.id,
            userName: currentUser.name,
            role: currentUser.role,
            action: 'User Deleted',
            detail: `Removed ${user.name} (${user.role.toUpperCase()})`,
          });
        }
      },
    });
  }

  exportExcel(): void {
    const rows: (string | number)[][] = [['Name', 'Role', 'PIN', 'Email', 'Mobile']];
    for (const u of this.users.sorted()) {
      rows.push([u.name, u.role, u.pin, u.email ?? '', u.mobile ?? '']);
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 28 }, { wch: 10 }, { wch: 8 }, { wch: 32 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Users');
    XLSX.writeFile(wb, 'Team_Users.xlsx');
  }

  async importExcel(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array' });
    const parsed = this.migration.parseUsersExcel(wb);
    const result = await this.migration.importUsersExcel(parsed.rows, 'merge');
    input.value = '';
    alert(
      `Import complete\n\nUsers: ${result.users}\n${result.errors.length ? 'Errors: ' + result.errors.length : 'No errors.'}`,
    );
  }
}

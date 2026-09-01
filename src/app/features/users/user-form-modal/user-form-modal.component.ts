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
import { SelectModule } from 'primeng/select';
import { InputOtpModule } from 'primeng/inputotp';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';

import { UserDoc, UserRole } from '@models/user';
import { UserRepository } from '@core/pouchdb/user.repository';
import { AuditRepository } from '@core/pouchdb/audit.repository';
import { AuthService } from '@core/services/auth.service';

export type UserModalMode = 'add' | 'edit' | 'change-pin';

/**
 * Reusable dialog for user management:
 *  - add: full form (name + role + PIN + confirm + optional email/mobile)
 *  - edit: same as add but name is read-only for identity stability
 *  - change-pin: only shows the PIN field (used from the app-shell)
 *
 * Bind `visible` two-way. Pass `editing` for edit / change-pin.
 */
@Component({
  selector: 'app-user-form-modal',
  standalone: true,
  imports: [
    FormsModule,
    DialogModule,
    InputTextModule,
    SelectModule,
    InputOtpModule,
    ButtonModule,
    MessageModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-form-modal.component.html',
  styleUrl: './user-form-modal.component.scss',
})
export class UserFormModalComponent {
  private readonly users = inject(UserRepository);
  private readonly audit = inject(AuditRepository);
  private readonly auth = inject(AuthService);

  readonly visible = model.required<boolean>();
  readonly editing = input<UserDoc | null>(null);
  readonly mode = input<UserModalMode>('add');
  readonly saved = output<UserDoc>();

  readonly name = signal('');
  readonly role = signal<UserRole>('user');
  readonly pin = signal('');
  readonly pin2 = signal('');
  readonly email = signal('');
  readonly mobile = signal('');
  readonly error = signal<string | null>(null);
  readonly submitting = signal(false);

  readonly roleOptions = [
    { label: 'Project Manager (PM)', value: 'pm' as UserRole },
    { label: 'Team Leader (TL)', value: 'tl' as UserRole },
    { label: 'Engineer / User', value: 'user' as UserRole },
  ];

  readonly title = computed(() => {
    switch (this.mode()) {
      case 'edit':
        return 'Edit User';
      case 'change-pin':
        return 'Change My PIN';
      default:
        return 'Add User';
    }
  });

  readonly saveLabel = computed(() =>
    this.mode() === 'add' ? 'Add User' : 'Save Changes',
  );

  readonly showFullForm = computed(() => this.mode() !== 'change-pin');
  readonly nameReadonly = computed(() => this.mode() !== 'add');
  readonly canChangeRole = computed(() => {
    if (this.mode() === 'add') return true;
    if (this.mode() === 'change-pin') return false;
    // Editing another user's role is fine if we're PM and not touching
    // the seeded PM account or the current user.
    const editing = this.editing();
    if (!editing) return false;
    if (editing._id === 'user:pm') return false;
    if (editing._id === this.auth.currentUser()?.id) return false;
    return this.auth.role() === 'pm';
  });

  constructor() {
    effect(() => {
      if (!this.visible()) return;
      const u = this.editing();
      this.name.set(u?.name ?? '');
      this.role.set(u?.role ?? 'user');
      this.email.set(u?.email ?? '');
      this.mobile.set(u?.mobile ?? '');
      this.pin.set('');
      this.pin2.set('');
      this.error.set(null);
      this.submitting.set(false);
    });
  }

  async save(): Promise<void> {
    this.error.set(null);
    const mode = this.mode();

    if (this.showFullForm() && !this.name().trim()) {
      this.error.set('Name is required.');
      return;
    }

    const pinRequired = mode === 'add' || mode === 'change-pin' || this.pin().length > 0;
    if (pinRequired) {
      if (!/^\d{4}$/.test(this.pin())) {
        this.error.set('PIN must be exactly 4 digits.');
        return;
      }
      if (this.pin() !== this.pin2()) {
        this.error.set('PINs do not match.');
        return;
      }
    }

    this.submitting.set(true);
    try {
      if (mode === 'add') {
        const dup = this.users
          .all()
          .some((u) => u.name.trim().toLowerCase() === this.name().trim().toLowerCase());
        if (dup) {
          this.error.set('A user with this name already exists.');
          return;
        }
        const created = await this.users.create({
          name: this.name().trim(),
          role: this.role(),
          pin: this.pin(),
          email: this.email().trim() || undefined,
          mobile: this.mobile().trim() || undefined,
        });
        this.recordAudit('User Added', `Added ${created.name} as ${created.role.toUpperCase()}`);
        this.saved.emit(created);
      } else {
        const existing = this.editing();
        if (!existing) throw new Error('No user to edit.');
        const changes: string[] = [];
        const next: UserDoc = { ...existing };
        if (mode !== 'change-pin' && this.canChangeRole() && this.role() !== existing.role) {
          changes.push(`role → ${this.role().toUpperCase()}`);
          next.role = this.role();
        }
        if (this.pin() && this.pin() !== existing.pin) {
          changes.push('PIN changed');
          next.pin = this.pin();
        }
        if (mode !== 'change-pin') {
          if (this.email() !== (existing.email ?? '')) {
            changes.push('email updated');
            next.email = this.email().trim();
          }
          if (this.mobile() !== (existing.mobile ?? '')) {
            changes.push('mobile updated');
            next.mobile = this.mobile().trim();
          }
        }
        const saved = await this.users.save(next);
        this.recordAudit(
          'User Edited',
          `${saved.name}: ${changes.join(', ') || 'no changes'}`,
        );
        this.saved.emit(saved);
      }
      this.visible.set(false);
    } catch (err) {
      this.error.set((err as Error).message ?? 'Save failed.');
    } finally {
      this.submitting.set(false);
    }
  }

  cancel(): void {
    this.visible.set(false);
  }

  private recordAudit(action: 'User Added' | 'User Edited', detail: string): void {
    const user = this.auth.currentUser();
    if (!user) return;
    this.audit.record({
      userId: user.id,
      userName: user.name,
      role: user.role,
      action,
      detail,
    });
  }
}

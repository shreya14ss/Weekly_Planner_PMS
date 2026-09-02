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
import { ProjectRepository } from '@core/pouchdb/project.repository';
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
  private readonly projects = inject(ProjectRepository);
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
  readonly originalName = computed(() => this.editing()?.name ?? '');
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

  /**
   * Save button enable state. Add mode requires the full form; edit
   * mode only requires PIN validity when the PIN was actually changed;
   * change-pin only requires a valid new PIN + confirm.
   */
  readonly canSave = computed(() => {
    const mode = this.mode();
    const pin = this.pin();
    const pin2 = this.pin2();

    if (mode === 'change-pin') {
      return /^\d{4}$/.test(pin) && pin === pin2;
    }

    if (mode === 'add') {
      if (!this.name().trim()) return false;
      if (!this.role()) return false;
      if (!isValidEmail(this.email())) return false;
      if (!/^\d{4}$/.test(pin)) return false;
      if (pin !== pin2) return false;
      return true;
    }

    // Edit mode — email is optional here (legacy users may not have one);
    // if provided, it must still be a valid format.
    if (!this.name().trim()) return false;
    if (!this.role()) return false;
    if (this.email().trim() && !isValidEmail(this.email())) return false;
    if (pin) {
      // A PIN was entered — must be valid and match confirm.
      if (!/^\d{4}$/.test(pin)) return false;
      if (pin !== pin2) return false;
    }
    return true;
  });

  /**
   * True if the form differs from the original editing target.
   * Always true in add mode. In edit / change-pin mode, entering a
   * PIN counts as a change even if other fields are untouched.
   */
  readonly hasChanges = computed(() => {
    const u = this.editing();
    if (!u) return true;
    if (this.pin().length > 0) return true; // any PIN entry = intent to change
    if (this.mode() === 'change-pin') return false;
    if ((u.name ?? '') !== this.name().trim()) return true;
    if (u.role !== this.role()) return true;
    if ((u.email ?? '') !== this.email().trim()) return true;
    if ((u.mobile ?? '') !== this.mobile().trim()) return true;
    return false;
  });

  readonly saveDisabled = computed(
    () => !this.canSave() || !this.hasChanges() || this.submitting(),
  );

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

    if (this.showFullForm()) {
      if (!this.name().trim()) {
        this.error.set('Name is required.');
        return;
      }
      if (!this.role()) {
        this.error.set('Role is required.');
        return;
      }
      // Email is mandatory when creating; optional (but format-checked) when editing.
      if (mode === 'add' && !isValidEmail(this.email())) {
        this.error.set('A valid email address is required.');
        return;
      }
      if (mode === 'edit' && this.email().trim() && !isValidEmail(this.email())) {
        this.error.set('Email address is not valid.');
        return;
      }
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
        const newName = this.name().trim();
        const nameChanged = mode !== 'change-pin' && newName !== existing.name;
        if (nameChanged) {
          const clash = this.users
            .all()
            .some(
              (u) => u._id !== existing._id && u.name.trim().toLowerCase() === newName.toLowerCase(),
            );
          if (clash) {
            this.error.set('Another user already has this name.');
            return;
          }
          changes.push(`name → ${newName}`);
          next.name = newName;
        }
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
        if (nameChanged) {
          await this.cascadeRename(existing.name, newName);
        }
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

  /**
   * Projects reference users by name (case-insensitive) in their
   * `engineers` and `tls` arrays. When a user is renamed, walk every
   * project and swap any matching entry so the association stays intact.
   */
  private async cascadeRename(oldName: string, newName: string): Promise<void> {
    const eq = (s: string) => s.trim().toLowerCase() === oldName.trim().toLowerCase();
    for (const p of this.projects.all()) {
      const engHit = p.engineers.some(eq);
      const tlHit = p.tls.some(eq);
      if (!engHit && !tlHit) continue;
      await this.projects.save({
        ...p,
        engineers: p.engineers.map((n) => (eq(n) ? newName : n)),
        tls: p.tls.map((n) => (eq(n) ? newName : n)),
      });
    }
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

/**
 * Basic RFC-ish check — has an `@` with at least one character on each
 * side and at least one dot after the `@`. Not exhaustive by design;
 * for internal team data this catches typos without blocking edge
 * cases like `+` aliases or hyphenated domains.
 */
function isValidEmail(raw: string): boolean {
  const s = (raw ?? '').trim();
  if (!s) return false;
  const at = s.indexOf('@');
  if (at <= 0 || at === s.length - 1) return false;
  const domain = s.slice(at + 1);
  return domain.includes('.') && !domain.startsWith('.');
}

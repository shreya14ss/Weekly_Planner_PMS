import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { AuthSession, UserRole } from '@models/user';
import { UserRepository } from '@core/pouchdb/user.repository';
import { AuditRepository } from '@core/pouchdb/audit.repository';

const SESSION_KEY = 'wpr_session';

/**
 * PIN-based auth against the local UserRepository. The CouchDB connection
 * itself uses a shared admin account (configured in app-settings.json) —
 * this service only decides which RBH user is currently signed in.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly users = inject(UserRepository);
  private readonly audit = inject(AuditRepository);
  private readonly router = inject(Router);

  private readonly session = signal<AuthSession | null>(this.restore());

  readonly currentUser = this.session.asReadonly();
  readonly isAuthenticated = computed(() => this.session() !== null);
  readonly role = computed<UserRole | null>(() => this.session()?.role ?? null);
  readonly isPM = computed(() => this.role() === 'pm');
  readonly isTL = computed(() => this.role() === 'tl');

  login(userId: string, pin: string): { ok: true } | { ok: false; error: string } {
    const user = this.users.authenticate(userId, pin);
    if (!user) return { ok: false, error: 'Incorrect PIN or user not found.' };

    const s: AuthSession = { id: user._id, name: user.name, role: user.role };
    this.session.set(s);
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));

    this.audit.record({
      userId: user._id,
      userName: user.name,
      role: user.role,
      action: 'Login',
      detail: `Signed in as ${user.role.toUpperCase()}`,
    });

    return { ok: true };
  }

  logout(): void {
    const s = this.session();
    if (s) {
      this.audit.record({
        userId: s.id,
        userName: s.name,
        role: s.role,
        action: 'Logout',
      });
    }
    this.session.set(null);
    sessionStorage.removeItem(SESSION_KEY);
    this.router.navigate(['/login']);
  }

  private restore(): AuthSession | null {
    try {
      const raw = sessionStorage.getItem(SESSION_KEY);
      return raw ? (JSON.parse(raw) as AuthSession) : null;
    } catch {
      return null;
    }
  }
}

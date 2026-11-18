import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { MenubarModule } from 'primeng/menubar';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';

import { AuthService } from '@core/services/auth.service';
import { AppActionsService } from '@core/services/app-actions.service';
import { WeekStateService } from '@core/services/week-state.service';
import { MyDayNotificationService } from '@features/my-day/my-day-notification.service';
// Sync status pill parked — see app-shell.component.html.
// import { DatabaseService } from '@core/pouchdb/database.service';
import { UserRepository } from '@core/pouchdb/user.repository';
import { UserDoc } from '@models/user';
import { WeekNavComponent } from '@shared/components/week-nav/week-nav.component';
import { UserFormModalComponent } from '@features/users/user-form-modal/user-form-modal.component';
import { AddProjectModalComponent } from '@features/projects/add-project-modal/add-project-modal.component';
import { AppToolbarComponent } from '@layout/app-toolbar/app-toolbar.component';
import { RecoveryDialogComponent } from '@layout/recovery-dialog/recovery-dialog.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [
    RouterOutlet,
    RouterLink,
    RouterLinkActive,
    MenubarModule,
    AvatarModule,
    ButtonModule,
    TagModule,
    ToastModule,
    TooltipModule,
    WeekNavComponent,
    UserFormModalComponent,
    AddProjectModalComponent,
    AppToolbarComponent,
    RecoveryDialogComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  private readonly auth = inject(AuthService);
  // private readonly db = inject(DatabaseService);
  private readonly users = inject(UserRepository);
  private readonly weekState = inject(WeekStateService);
  private readonly messages = inject(MessageService);
  protected readonly actions = inject(AppActionsService);
  // Eager inject so timed-reminder + meeting notifications are scheduled
  // app-wide, not just when the user visits /app/my-day.
  private readonly myDayNotifications = inject(MyDayNotificationService);

  /** Guard against running auto-carry more than once per session even
   *  if the auth state briefly flickers during startup. */
  private autoCarryRan = false;

  constructor() {
    // Auto-carry past-week pending tasks into the current week on the
    // first session where a PM/TL is signed in. Role-gated — only PM /
    // TL are authorised to carry (same gate as the Pending Tasks Bar).
    effect(() => {
      const user = this.auth.currentUser();
      if (!user) return;
      if (user.role !== 'pm' && user.role !== 'tl') return;
      if (this.autoCarryRan) return;
      this.autoCarryRan = true;
      void this.runAutoCarry();
    });
  }

  private async runAutoCarry(): Promise<void> {
    try {
      const count = await this.weekState.autoCarryPending();
      if (count > 0) {
        this.messages.add({
          severity: 'info',
          summary: 'Tasks carried forward',
          detail: `${count} incomplete task${count === 1 ? '' : 's'} from previous weeks moved into this week.`,
          life: 6000,
        });
      }
    } catch (err) {
      // Non-fatal — the user can still carry manually via the Pending
      // Tasks Bar. Surface it so a silent failure isn't invisible.
      console.error('[auto-carry]', err);
      this.messages.add({
        severity: 'warn',
        summary: 'Auto-carry skipped',
        detail: 'Some pending tasks could not be moved automatically. Use the Pending Tasks bar to carry them manually.',
        life: 8000,
      });
    }
  }

  readonly user = this.auth.currentUser;
  readonly isPM = this.auth.isPM;
  readonly isTL = this.auth.isTL;
  // Sync status pill parked — see app-shell.component.html.
  // readonly syncStatus = this.db.syncStatus;

  readonly pinModalOpen = signal(false);
  readonly pinEditing = computed<UserDoc | null>(() => {
    const id = this.user()?.id;
    if (!id) return null;
    return this.users.get(id) ?? null;
  });

  readonly initials = computed(() => {
    const name = this.user()?.name ?? '';
    return name
      .split(' ')
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  });

  readonly roleLabel = computed(() => {
    const r = this.user()?.role;
    return r === 'pm' ? 'PM' : r === 'tl' ? 'TL' : 'Engineer';
  });

  /**
   * Hide the role tag when it would be a visual duplicate of the
   * avatar initials — e.g. a user literally named "Project Manager"
   * has initials `PM` AND role tag `PM`.
   */
  readonly showRoleTag = computed(
    () => this.initials().toLowerCase() !== this.roleLabel().toLowerCase(),
  );

  // readonly syncSeverity = computed<'success' | 'info' | 'warn' | 'danger'>(() => {
  //   const s = this.syncStatus();
  //   if (s === 'active') return 'success';
  //   if (s === 'paused' || s === 'idle') return 'info';
  //   if (s === 'offline') return 'warn';
  //   return 'danger';
  // });

  openChangePin(): void {
    this.pinModalOpen.set(true);
  }

  logout(): void {
    this.auth.logout();
  }
}

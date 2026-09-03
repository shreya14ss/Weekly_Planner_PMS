import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { MenubarModule } from 'primeng/menubar';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from '@core/services/auth.service';
import { AppActionsService } from '@core/services/app-actions.service';
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
  protected readonly actions = inject(AppActionsService);

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

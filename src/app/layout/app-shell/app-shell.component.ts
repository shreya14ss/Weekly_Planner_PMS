import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { MenubarModule } from 'primeng/menubar';
import { AvatarModule } from 'primeng/avatar';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { AuthService } from '@core/services/auth.service';
import { DatabaseService } from '@core/pouchdb/database.service';

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
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.scss',
})
export class AppShellComponent {
  private readonly auth = inject(AuthService);
  private readonly db = inject(DatabaseService);

  readonly user = this.auth.currentUser;
  readonly isPM = this.auth.isPM;
  readonly isTL = this.auth.isTL;
  readonly syncStatus = this.db.syncStatus;

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

  readonly syncSeverity = computed<'success' | 'info' | 'warn' | 'danger'>(() => {
    const s = this.syncStatus();
    if (s === 'active') return 'success';
    if (s === 'paused' || s === 'idle') return 'info';
    if (s === 'offline') return 'warn';
    return 'danger';
  });

  logout(): void {
    this.auth.logout();
  }
}

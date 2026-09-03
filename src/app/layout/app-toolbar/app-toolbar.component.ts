import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { AppActionsService } from '@core/services/app-actions.service';
import { AuthService } from '@core/services/auth.service';
import { ExportService } from '@core/services/export.service';
import { ProjectRepository } from '@core/pouchdb/project.repository';
import { isProjectVisible } from '@core/services/project-permissions';
import { ProjectDoc } from '@models/project';

/**
 * Persistent action toolbar mounted below the tab nav — visible on
 * every tab, matches the legacy layout.
 *
 * Buttons split into two groups:
 *   Left  — create / import / export
 *   Right — Excel report / recover
 */
@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [ButtonModule, TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-toolbar.component.html',
  styleUrl: './app-toolbar.component.scss',
})
export class AppToolbarComponent {
  protected readonly actions = inject(AppActionsService);
  protected readonly auth = inject(AuthService);
  private readonly export_ = inject(ExportService);
  private readonly projects = inject(ProjectRepository);
  private readonly router = inject(Router);

  /** Projects the current user can see — the exports use this as scope. */
  private visibleProjects(): ProjectDoc[] {
    const user = this.auth.currentUser();
    return this.projects.all().filter((p) => isProjectVisible(user, p));
  }

  openImport(): void {
    this.router.navigate(['/app/import']);
  }

  exportList(): void {
    this.export_.exportProjectList(this.visibleProjects());
  }

  exportBackup(): void {
    void this.actions.exportBackup();
  }

  exportReport(): void {
    this.export_.exportWeeklyReport(this.visibleProjects());
  }

  hasProjects(): boolean {
    return this.visibleProjects().length > 0;
  }
}

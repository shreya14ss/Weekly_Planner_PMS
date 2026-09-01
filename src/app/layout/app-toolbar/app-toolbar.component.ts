import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

import { AppActionsService } from '@core/services/app-actions.service';
import { AuthService } from '@core/services/auth.service';
import { ExportService } from '@core/services/export.service';
import { ProjectRepository } from '@core/pouchdb/project.repository';
import { WeekStateService } from '@core/services/week-state.service';
import { isProjectVisible } from '@core/services/project-permissions';
import { ProjectDoc } from '@models/project';

/**
 * Persistent action toolbar mounted below the tab nav — visible on
 * every tab, matches the legacy layout.
 *
 * Buttons split into two groups:
 *   Left  — create / import / export
 *   Right — Excel report / clear / recover
 */
@Component({
  selector: 'app-toolbar',
  standalone: true,
  imports: [ButtonModule, TooltipModule, ConfirmDialogModule],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app-toolbar.component.html',
  styleUrl: './app-toolbar.component.scss',
})
export class AppToolbarComponent {
  protected readonly actions = inject(AppActionsService);
  protected readonly auth = inject(AuthService);
  private readonly export_ = inject(ExportService);
  private readonly projects = inject(ProjectRepository);
  private readonly state = inject(WeekStateService);
  private readonly router = inject(Router);
  private readonly confirm = inject(ConfirmationService);

  protected readonly clearing = signal(false);

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

  clearAll(event: MouseEvent): void {
    this.confirm.confirm({
      target: event.target as EventTarget,
      message:
        'This will DELETE every project, week, and audit entry in this browser. ' +
        'The seeded PM account is preserved. This cannot be undone.',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Clear Everything',
      acceptButtonStyleClass: 'p-button-danger',
      rejectLabel: 'Cancel',
      accept: async () => {
        this.clearing.set(true);
        try {
          await this.actions.clearAllData();
        } finally {
          this.clearing.set(false);
        }
      },
    });
  }

  hasProjects(): boolean {
    return this.visibleProjects().length > 0;
  }
}

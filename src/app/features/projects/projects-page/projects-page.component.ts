import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ConfirmationService } from 'primeng/api';

import { ProjectDoc } from '@models/project';
import { AuthService } from '@core/services/auth.service';
import { WeekStateService } from '@core/services/week-state.service';
import { AppActionsService } from '@core/services/app-actions.service';
import { ProjectFilterService } from '@features/projects/project-filter.service';
import { ProjectCardComponent } from '@features/projects/project-card/project-card.component';
import { PendingTasksBarComponent } from '@features/projects/pending-tasks-bar/pending-tasks-bar.component';

/**
 * Projects page:
 *  - Search + engineer filter
 *  - Client-grouped list of expandable project cards
 *
 * The Add/Edit modal lives at the AppShell layer now, driven by
 * AppActionsService. This page just triggers openAdd/openEdit.
 */
@Component({
  selector: 'app-projects-page',
  standalone: true,
  imports: [
    FormsModule,
    ButtonModule,
    SelectModule,
    InputTextModule,
    CardModule,
    TagModule,
    TooltipModule,
    ConfirmDialogModule,
    ProjectCardComponent,
    PendingTasksBarComponent,
  ],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-page.component.html',
  styleUrl: './projects-page.component.scss',
})
export class ProjectsPageComponent {
  protected readonly auth = inject(AuthService);
  protected readonly filter = inject(ProjectFilterService);
  protected readonly state = inject(WeekStateService);
  private readonly actions = inject(AppActionsService);
  private readonly confirm = inject(ConfirmationService);

  protected readonly search = signal('');
  protected readonly collapsedClients = signal<ReadonlySet<string>>(new Set());

  protected readonly groups = computed(() => {
    const q = this.search().trim().toLowerCase();
    if (!q) return this.filter.grouped();

    return this.filter
      .grouped()
      .map((g) => ({
        client: g.client,
        projects: g.projects.filter(
          (p) =>
            p.client.toLowerCase().includes(q) ||
            p.name.toLowerCase().includes(q) ||
            p.engineers.some((e) => e.toLowerCase().includes(q)),
        ),
      }))
      .filter((g) => g.projects.length > 0);
  });

  protected readonly totalVisible = computed(() =>
    this.groups().reduce((acc, g) => acc + g.projects.length, 0),
  );

  protected readonly engineerOptions = computed(() => [
    { label: 'All engineers', value: '' },
    ...this.filter.engineerOptions().map((n) => ({ label: n, value: n })),
  ]);

  protected readonly dirtyCount = computed(() => this.state.dirty().size);

  openEdit(p: ProjectDoc): void {
    this.actions.openEditProject(p);
  }

  openDelete(p: ProjectDoc): void {
    if (!this.auth.isPM()) return;
    const label = p.name && p.name !== '—' ? p.name : `${p.client} Site`;
    this.confirm.confirm({
      header: 'Delete project',
      message:
        `Delete "${label}"? This removes the project and every weekly ` +
        `entry recorded against it. This cannot be undone.`,
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Delete',
      acceptButtonStyleClass: 'p-button-danger',
      rejectLabel: 'Cancel',
      accept: () => void this.actions.deleteProject(p),
    });
  }

  addProjectFor(client: string, event: MouseEvent): void {
    // Stop the click from also toggling the group's collapse state.
    event.stopPropagation();
    this.actions.openAddProject(client);
  }

  toggleClient(client: string): void {
    const set = new Set(this.collapsedClients());
    if (set.has(client)) set.delete(client);
    else set.add(client);
    this.collapsedClients.set(set);
  }

  isCollapsed(client: string): boolean {
    return this.collapsedClients().has(client);
  }
}

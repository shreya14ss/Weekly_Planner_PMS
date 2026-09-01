import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';
import { InputTextModule } from 'primeng/inputtext';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { ProjectDoc } from '@models/project';
import { AuthService } from '@core/services/auth.service';
import { WeekStateService } from '@core/services/week-state.service';
import { ProjectFilterService } from '@features/projects/project-filter.service';
import { AddProjectModalComponent } from '@features/projects/add-project-modal/add-project-modal.component';
import { ProjectCardComponent } from '@features/projects/project-card/project-card.component';

/**
 * Projects page:
 *  - Toolbar (search filter, add project)
 *  - Client-grouped list of expandable project cards
 *  - Add/Edit modal wired to the ProjectRepository
 *
 * State lives in the injected services:
 *   ProjectFilterService: visible list + grouping
 *   WeekStateService: per-project entries for the current week
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
    AddProjectModalComponent,
    ProjectCardComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './projects-page.component.html',
  styleUrl: './projects-page.component.scss',
})
export class ProjectsPageComponent {
  protected readonly auth = inject(AuthService);
  protected readonly filter = inject(ProjectFilterService);
  protected readonly state = inject(WeekStateService);

  protected readonly search = signal('');
  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<ProjectDoc | null>(null);
  protected readonly collapsedClients = signal<ReadonlySet<string>>(new Set());

  /**
   * Groups after the engineer filter + free-text search are applied.
   * The engineer filter is upstream (ProjectFilterService); search
   * further narrows by project or client name.
   */
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

  openAdd(): void {
    this.editing.set(null);
    this.modalOpen.set(true);
  }

  openEdit(p: ProjectDoc): void {
    this.editing.set(p);
    this.modalOpen.set(true);
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

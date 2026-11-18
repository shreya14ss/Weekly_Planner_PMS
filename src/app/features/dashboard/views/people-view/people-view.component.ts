import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ProjectRepository } from '@core/pouchdb/project.repository';
import { DashboardStateService } from '@features/dashboard/dashboard-state.service';
import { EngineerPerformanceComponent } from '@features/dashboard/engineer-performance/engineer-performance.component';
import { ProjectFollowUpComponent } from '@features/dashboard/project-follow-up/project-follow-up.component';
import { TlPerformanceCardsComponent } from '@features/dashboard/tl-performance-cards/tl-performance-cards.component';
import { PendingTasksBarComponent } from '@features/projects/pending-tasks-bar/pending-tasks-bar.component';

@Component({
  selector: 'app-people-view',
  standalone: true,
  imports: [
    EngineerPerformanceComponent,
    ProjectFollowUpComponent,
    TlPerformanceCardsComponent,
    PendingTasksBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './people-view.component.html',
  styleUrl: './people-view.component.scss',
})
export class PeopleViewComponent {
  protected readonly state = inject(DashboardStateService);
  private readonly projects = inject(ProjectRepository);

  protected readonly loading = computed(() => !this.projects.ready());
}

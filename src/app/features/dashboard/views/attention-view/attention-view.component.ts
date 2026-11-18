import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ProjectRepository } from '@core/pouchdb/project.repository';
import { DashboardStateService } from '@features/dashboard/dashboard-state.service';
import { AttentionListComponent } from '@features/dashboard/attention-list/attention-list.component';
import { DelayedTasksFilterComponent } from '@features/dashboard/delayed-tasks-filter/delayed-tasks-filter.component';
import { WeeklyScheduleTrackerComponent } from '@features/dashboard/weekly-schedule-tracker/weekly-schedule-tracker.component';

@Component({
  selector: 'app-attention-view',
  standalone: true,
  imports: [
    AttentionListComponent,
    DelayedTasksFilterComponent,
    WeeklyScheduleTrackerComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './attention-view.component.html',
  styleUrl: './attention-view.component.scss',
})
export class AttentionViewComponent {
  protected readonly state = inject(DashboardStateService);
  private readonly projects = inject(ProjectRepository);

  protected readonly loading = computed(() => !this.projects.ready());
}

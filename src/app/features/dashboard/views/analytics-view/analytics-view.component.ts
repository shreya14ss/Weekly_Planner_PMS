import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';

import { ProjectRepository } from '@core/pouchdb/project.repository';
import { DashboardStateService } from '@features/dashboard/dashboard-state.service';
import { ClientBarsComponent } from '@features/dashboard/client-bars/client-bars.component';
import { ProjectTaskBreakdownComponent } from '@features/dashboard/project-task-breakdown/project-task-breakdown.component';
import { WeeklyTrendChartComponent } from '@features/dashboard/weekly-trend-chart/weekly-trend-chart.component';

@Component({
  selector: 'app-analytics-view',
  standalone: true,
  imports: [
    ClientBarsComponent,
    ProjectTaskBreakdownComponent,
    WeeklyTrendChartComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './analytics-view.component.html',
  styleUrl: './analytics-view.component.scss',
})
export class AnalyticsViewComponent {
  protected readonly state = inject(DashboardStateService);
  private readonly projects = inject(ProjectRepository);

  protected readonly loading = computed(() => !this.projects.ready());
}

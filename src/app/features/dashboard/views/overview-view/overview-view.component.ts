import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';

import { ProjectRepository } from '@core/pouchdb/project.repository';
import { DashboardStateService } from '@features/dashboard/dashboard-state.service';
import { KpiCardsComponent } from '@features/dashboard/kpi-cards/kpi-cards.component';
import { WeeklyTrendChartComponent } from '@features/dashboard/weekly-trend-chart/weekly-trend-chart.component';

@Component({
  selector: 'app-overview-view',
  standalone: true,
  imports: [RouterLink, KpiCardsComponent, WeeklyTrendChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './overview-view.component.html',
  styleUrl: './overview-view.component.scss',
})
export class OverviewViewComponent {
  protected readonly state = inject(DashboardStateService);
  private readonly projects = inject(ProjectRepository);

  protected readonly loading = computed(() => !this.projects.ready());
  protected readonly skeletonKpis = [0, 1, 2, 3, 4, 5];

  protected readonly attentionCount = computed(
    () => this.state.delayedList().length + this.state.onHoldList().length,
  );
}

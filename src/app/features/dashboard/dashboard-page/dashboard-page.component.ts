import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { DashboardFilterService, DashStatusFilter } from '@features/dashboard/dashboard-filter.service';
import { useDashboardAggregations } from '@features/dashboard/dashboard-aggregations';
import { KpiCardsComponent } from '@features/dashboard/kpi-cards/kpi-cards.component';
import { StatusDonutComponent } from '@features/dashboard/status-donut/status-donut.component';
import { ClientBarsComponent } from '@features/dashboard/client-bars/client-bars.component';
import { AttentionListComponent } from '@features/dashboard/attention-list/attention-list.component';
import { EngineerPerformanceComponent } from '@features/dashboard/engineer-performance/engineer-performance.component';
import { ProjectTaskBreakdownComponent } from '@features/dashboard/project-task-breakdown/project-task-breakdown.component';
import { DelayedTasksFilterComponent } from '@features/dashboard/delayed-tasks-filter/delayed-tasks-filter.component';
import { WeeklyTrendChartComponent } from '@features/dashboard/weekly-trend-chart/weekly-trend-chart.component';

interface StatusOption {
  label: string;
  value: DashStatusFilter;
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    FormsModule,
    CardModule,
    SelectModule,
    ButtonModule,
    TagModule,
    KpiCardsComponent,
    StatusDonutComponent,
    ClientBarsComponent,
    AttentionListComponent,
    EngineerPerformanceComponent,
    ProjectTaskBreakdownComponent,
    DelayedTasksFilterComponent,
    WeeklyTrendChartComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent {
  protected readonly filter = inject(DashboardFilterService);
  private readonly router = inject(Router);

  private readonly agg = useDashboardAggregations(() => this.filter.scope());

  protected readonly kpis = this.agg.kpis;
  protected readonly clientBars = this.agg.clientBars;
  protected readonly statusSegments = this.agg.statusSegments;
  protected readonly delayedList = this.agg.delayedList;
  protected readonly onHoldList = this.agg.onHoldList;
  protected readonly engineerRows = this.agg.engineerRows;
  protected readonly projectTaskBreakdown = this.agg.projectTaskBreakdown;
  protected readonly delayedTasks = this.agg.delayedTasks;

  protected readonly clientOptions = computed(() => [
    { label: 'All Clients', value: 'all' },
    ...this.filter.clientOptions().map((c) => ({ label: c, value: c })),
  ]);

  protected readonly tlOptions = computed(() => [
    { label: 'All TLs / Engineers', value: 'all' },
    ...this.filter.tlOptions().map((c) => ({ label: c, value: c })),
  ]);

  protected readonly statusOptions: StatusOption[] = [
    { label: 'All Status', value: 'all' },
    { label: 'Active', value: 'active' },
    { label: 'Delayed', value: 'delayed' },
    { label: 'On Hold', value: 'hold' },
    { label: 'Not Started', value: 'not-started' },
    { label: 'Not Filled', value: 'no-update' },
  ];

  protected readonly hasAnyFilter = computed(
    () =>
      this.filter.client() !== 'all' ||
      this.filter.tl() !== 'all' ||
      this.filter.status() !== 'all',
  );

  reset(): void {
    this.filter.reset();
  }

  openProject(projectId: string): void {
    // Route by fragment so the ProjectsPage can scroll to the card.
    this.router.navigate(['/app/projects'], { fragment: projectId });
  }
}

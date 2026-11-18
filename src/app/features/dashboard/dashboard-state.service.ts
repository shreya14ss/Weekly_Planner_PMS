import { Injectable, inject, signal } from '@angular/core';

import { DashboardFilterService } from '@features/dashboard/dashboard-filter.service';
import { useDashboardAggregations } from '@features/dashboard/dashboard-aggregations';

/**
 * Dashboard-scoped state shared across the shell and its child views.
 *
 * Provided at the dashboard route so aggregations are built exactly
 * once per mount and all views (overview/attention/analytics/people)
 * read the same memoized signals. Also owns the detail-modal state so
 * any view's `(open)` event can pop the shared modal in the shell.
 */
@Injectable()
export class DashboardStateService {
  readonly filter = inject(DashboardFilterService);

  private readonly agg = useDashboardAggregations(() => this.filter.scope());

  readonly kpis = this.agg.kpis;
  readonly clientBars = this.agg.clientBars;
  readonly statusSegments = this.agg.statusSegments;
  readonly delayedList = this.agg.delayedList;
  readonly onHoldList = this.agg.onHoldList;
  readonly engineerRows = this.agg.engineerRows;
  readonly projectTaskBreakdown = this.agg.projectTaskBreakdown;
  readonly delayedTasks = this.agg.delayedTasks;
  readonly followUpRows = this.agg.followUpRows;
  readonly blockers = this.agg.blockers;
  readonly trackerRows = this.agg.trackerRows;
  readonly healthSummary = this.agg.healthSummary;
  readonly tlPerformance = this.agg.tlPerformance;

  readonly detailOpen = signal<boolean>(false);
  readonly detailProjectId = signal<string | null>(null);

  openProject(projectId: string): void {
    this.detailProjectId.set(projectId);
    this.detailOpen.set(true);
  }
}

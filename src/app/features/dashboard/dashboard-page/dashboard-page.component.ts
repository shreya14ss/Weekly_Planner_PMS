import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  QueryList,
  ViewChildren,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';

import { ProjectRepository } from '@core/pouchdb/project.repository';
import { DashboardFilterService, DashStatusFilter } from '@features/dashboard/dashboard-filter.service';
import { useDashboardAggregations } from '@features/dashboard/dashboard-aggregations';
import { dashFilterForStatusLabel } from '@features/dashboard/status-utils';
import { KpiCardsComponent } from '@features/dashboard/kpi-cards/kpi-cards.component';
import { PriorityStripComponent } from '@features/dashboard/priority-strip/priority-strip.component';
// StatusDonutComponent — kept import commented alongside the commented-out Status Distribution card.
// import { StatusDonutComponent } from '@features/dashboard/status-donut/status-donut.component';
import { ClientBarsComponent } from '@features/dashboard/client-bars/client-bars.component';
import { AttentionListComponent } from '@features/dashboard/attention-list/attention-list.component';
import { EngineerPerformanceComponent } from '@features/dashboard/engineer-performance/engineer-performance.component';
import { ProjectTaskBreakdownComponent } from '@features/dashboard/project-task-breakdown/project-task-breakdown.component';
import { DelayedTasksFilterComponent } from '@features/dashboard/delayed-tasks-filter/delayed-tasks-filter.component';
import { WeeklyTrendChartComponent } from '@features/dashboard/weekly-trend-chart/weekly-trend-chart.component';
import { ProjectFollowUpComponent } from '@features/dashboard/project-follow-up/project-follow-up.component';
import { WeeklyScheduleTrackerComponent } from '@features/dashboard/weekly-schedule-tracker/weekly-schedule-tracker.component';
import { TlPerformanceCardsComponent } from '@features/dashboard/tl-performance-cards/tl-performance-cards.component';
import { ProjectDetailModalComponent } from '@features/dashboard/project-detail-modal/project-detail-modal.component';
import { PendingTasksBarComponent } from '@features/projects/pending-tasks-bar/pending-tasks-bar.component';

interface StatusOption {
  label: string;
  value: DashStatusFilter;
}

interface SectionTab {
  id: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    FormsModule,
    SelectModule,
    ButtonModule,
    KpiCardsComponent,
    PriorityStripComponent,
    // StatusDonutComponent, — see commented import above
    ClientBarsComponent,
    AttentionListComponent,
    EngineerPerformanceComponent,
    ProjectTaskBreakdownComponent,
    DelayedTasksFilterComponent,
    WeeklyTrendChartComponent,
    ProjectFollowUpComponent,
    WeeklyScheduleTrackerComponent,
    TlPerformanceCardsComponent,
    ProjectDetailModalComponent,
    PendingTasksBarComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent implements AfterViewInit {
  protected readonly filter = inject(DashboardFilterService);
  private readonly router = inject(Router);
  private readonly projects = inject(ProjectRepository);
  private readonly destroyRef = inject(DestroyRef);

  private readonly agg = useDashboardAggregations(() => this.filter.scope());

  protected readonly kpis = this.agg.kpis;
  protected readonly clientBars = this.agg.clientBars;
  protected readonly statusSegments = this.agg.statusSegments;
  protected readonly delayedList = this.agg.delayedList;
  protected readonly onHoldList = this.agg.onHoldList;
  protected readonly engineerRows = this.agg.engineerRows;
  protected readonly projectTaskBreakdown = this.agg.projectTaskBreakdown;
  protected readonly delayedTasks = this.agg.delayedTasks;
  protected readonly followUpRows = this.agg.followUpRows;
  protected readonly blockers = this.agg.blockers;
  protected readonly trackerRows = this.agg.trackerRows;
  protected readonly healthSummary = this.agg.healthSummary;
  protected readonly tlPerformance = this.agg.tlPerformance;

  /** Show skeletons until the first PouchDB load completes. */
  protected readonly loading = computed(() => !this.projects.ready());

  /** Static tuple for the KPI skeleton row (6 tiles). */
  protected readonly skeletonKpis = [0, 1, 2, 3, 4, 5];

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

  /** Mini-nav tab definitions — id matches the section anchor. */
  protected readonly tabs: SectionTab[] = [
    { id: 'sec-overview', label: 'Overview', icon: 'pi-th-large' },
    { id: 'sec-attention', label: 'Attention', icon: 'pi-flag-fill' },
    { id: 'sec-analytics', label: 'Analytics', icon: 'pi-chart-pie' },
    { id: 'sec-people', label: 'People', icon: 'pi-users' },
  ];
  protected readonly activeTab = signal<string>('sec-overview');

  /** Detail modal — opens when any dashboard row emits `open`. */
  protected readonly detailOpen = signal<boolean>(false);
  protected readonly detailProjectId = signal<string | null>(null);

  @ViewChildren('section')
  private sectionEls?: QueryList<ElementRef<HTMLElement>>;
  private io?: IntersectionObserver;

  ngAfterViewInit(): void {
    if (typeof IntersectionObserver === 'undefined') return;
    // Trigger the active tab as soon as any section header crosses the
    // top ~15% of the viewport — feels responsive without whiplash.
    this.io = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit?.target.id) this.activeTab.set(hit.target.id);
      },
      { rootMargin: '0px 0px -70% 0px', threshold: 0 },
    );
    this.observeSections();
    // Sections mount after `loading()` flips false — re-attach then.
    this.sectionEls?.changes
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.observeSections());
    this.destroyRef.onDestroy(() => this.io?.disconnect());
  }

  private observeSections(): void {
    if (!this.io) return;
    this.io.disconnect();
    this.sectionEls?.forEach((el) => this.io!.observe(el.nativeElement));
  }

  jumpTo(id: string): void {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    this.activeTab.set(id);
  }

  reset(): void {
    this.filter.reset();
  }

  /**
   * Called by every dashboard row/pill that wants to "open" a project.
   * Pops the shared detail modal instead of navigating away — the modal
   * itself offers a "Open Project" button (see `navigateToProject`) for
   * users who want to jump to the full project card.
   */
  openProject(projectId: string): void {
    this.detailProjectId.set(projectId);
    this.detailOpen.set(true);
  }

  /** Wired to the modal's "Open Project" button. */
  navigateToProject(projectId: string): void {
    this.router.navigate(['/app/projects'], { fragment: projectId });
  }

  applyStatusFilter(status: DashStatusFilter): void {
    // Toggle: if the same pill is clicked again, clear it.
    this.filter.status.set(this.filter.status() === status ? 'all' : status);
  }

  applyStatusLabelFilter(label: string): void {
    const key = dashFilterForStatusLabel(label);
    if (!key) return; // label doesn't map to a valid filter bucket ("Not Set" etc.)
    this.applyStatusFilter(key as DashStatusFilter);
  }
}

import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';

import { ProjectRepository } from '@core/pouchdb/project.repository';
import { DashStatusFilter } from '@features/dashboard/dashboard-filter.service';
import { DashboardStateService } from '@features/dashboard/dashboard-state.service';
import { PriorityStripComponent } from '@features/dashboard/priority-strip/priority-strip.component';
import { ProjectDetailModalComponent } from '@features/dashboard/project-detail-modal/project-detail-modal.component';

interface StatusOption {
  label: string;
  value: DashStatusFilter;
}

interface SectionTab {
  path: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [
    FormsModule,
    RouterLink,
    RouterLinkActive,
    RouterOutlet,
    SelectModule,
    ButtonModule,
    PriorityStripComponent,
    ProjectDetailModalComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './dashboard-page.component.html',
  styleUrl: './dashboard-page.component.scss',
})
export class DashboardPageComponent {
  protected readonly state = inject(DashboardStateService);
  protected readonly filter = this.state.filter;
  private readonly router = inject(Router);
  private readonly projects = inject(ProjectRepository);

  protected readonly kpis = this.state.kpis;

  /** Show the priority strip only after the first PouchDB load completes. */
  protected readonly loading = computed(() => !this.projects.ready());

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

  /** Mini-nav tabs — each `path` is a child route under /app/dashboard. */
  protected readonly tabs: SectionTab[] = [
    { path: 'overview', label: 'Overview', icon: 'pi-th-large' },
    { path: 'attention', label: 'Attention', icon: 'pi-flag-fill' },
    { path: 'analytics', label: 'Analytics', icon: 'pi-chart-pie' },
    { path: 'people', label: 'People', icon: 'pi-users' },
  ];

  reset(): void {
    this.filter.reset();
  }

  /** Wired to the modal's "Open Project" button. */
  navigateToProject(projectId: string): void {
    this.router.navigate(['/app/projects'], { fragment: projectId });
  }

  applyStatusFilter(status: DashStatusFilter): void {
    // Toggle: if the same pill is clicked again, clear it.
    this.filter.status.set(this.filter.status() === status ? 'all' : status);
  }
}

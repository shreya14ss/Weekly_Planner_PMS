import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { StatusChipComponent } from '@shared/components/status-chip/status-chip.component';
import { AlertsService } from '@features/alerts/alerts.service';
import { effectiveStatus } from '@features/dashboard/status-utils';
import { WeekStateService } from '@core/services/week-state.service';

@Component({
  selector: 'app-alerts-page',
  standalone: true,
  imports: [
    FormsModule,
    CardModule,
    SelectModule,
    ButtonModule,
    TagModule,
    TooltipModule,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './alerts-page.component.html',
  styleUrl: './alerts-page.component.scss',
})
export class AlertsPageComponent {
  protected readonly alerts = inject(AlertsService);
  protected readonly weekState = inject(WeekStateService);
  private readonly router = inject(Router);

  protected readonly clientOptions = computed(() => [
    { label: 'All Clients', value: 'all' },
    ...this.alerts.clientOptions().map((c) => ({ label: c, value: c })),
  ]);

  protected readonly tlOptions = computed(() => [
    { label: 'All TLs / Engineers', value: 'all' },
    ...this.alerts.tlOptions().map((n) => ({ label: n, value: n })),
  ]);

  effStatus(pid: string): string {
    const p = this.alerts.overdue().find((r) => r.project._id === pid)?.project;
    if (!p) return '';
    return effectiveStatus(p, this.weekState.entries()[pid]);
  }

  openProject(projectId: string): void {
    this.router.navigate(['/app/projects'], { fragment: projectId });
  }
}

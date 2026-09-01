import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { CompletedService } from '@features/completed/completed.service';
import { StatusChipComponent } from '@shared/components/status-chip/status-chip.component';

@Component({
  selector: 'app-completed-page',
  standalone: true,
  imports: [
    FormsModule,
    CardModule,
    SelectModule,
    ButtonModule,
    TagModule,
    StatusChipComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './completed-page.component.html',
  styleUrl: './completed-page.component.scss',
})
export class CompletedPageComponent {
  protected readonly completed = inject(CompletedService);
  private readonly router = inject(Router);

  protected readonly clientOptions = computed(() => [
    { label: 'All Clients', value: 'all' },
    ...this.completed.clientOptions().map((c) => ({ label: c, value: c })),
  ]);

  openProject(projectId: string): void {
    this.router.navigate(['/app/projects'], { fragment: projectId });
  }
}

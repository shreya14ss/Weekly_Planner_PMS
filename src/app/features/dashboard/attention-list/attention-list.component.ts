import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';

import { AttentionProject } from '@features/dashboard/dashboard-aggregations';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

/**
 * Reusable list card used for "Delayed Projects" and "On Hold" panes.
 * The parent supplies the title, tint colour, and the item array.
 */
@Component({
  selector: 'app-attention-list',
  standalone: true,
  imports: [ButtonModule, TooltipModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="hdr">
      <i class="pi pi-exclamation-triangle" [style.color]="titleColor()"></i>
      <h3 class="title" [style.color]="titleColor()">{{ title() }}</h3>
      <span class="count">{{ items().length }}</span>
    </header>

    @if (items().length === 0) {
      <app-empty-state variant="check" subtitle="Nothing needs attention here — nice." />
    } @else {
      <ul class="list">
        @for (row of items(); track row.project._id) {
          <li class="row">
            <div class="body">
              <div class="row-top">
                <span class="client-tag">{{ row.project.client }}</span>
                <span class="name" [title]="row.displayName">{{ row.displayName }}</span>
              </div>
              <div class="eng">
                {{ row.project.engineers.join(', ') || 'Unassigned' }}
              </div>
              @if (row.reason) {
                <div class="reason">{{ row.reason }}</div>
              }
            </div>
            <div class="actions">
              @if (row.targetDate) {
                <span class="target">Target: {{ row.targetDate }}</span>
              }
              <p-button
                icon="pi pi-external-link"
                [rounded]="true"
                [text]="true"
                size="small"
                severity="secondary"
                pTooltip="Open project"
                tooltipPosition="left"
                (onClick)="open.emit(row.project._id)"
              />
            </div>
          </li>
        }
      </ul>
    }
  `,
  styleUrl: './attention-list.component.scss',
})
export class AttentionListComponent {
  readonly title = input.required<string>();
  readonly titleColor = input<string>('#DC2626');
  readonly items = input.required<AttentionProject[]>();
  readonly open = output<string>();
}

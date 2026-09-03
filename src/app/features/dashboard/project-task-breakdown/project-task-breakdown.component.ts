import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';

import { ProjectTaskBreakdownRow } from '@features/dashboard/dashboard-aggregations';
import { EmptyStateComponent } from '@shared/components/empty-state/empty-state.component';

/**
 * Per-project task-status breakdown. Empty projects (no tasks yet)
 * are excluded upstream so this table stays actionable.
 */
@Component({
  selector: 'app-project-task-breakdown',
  standalone: true,
  imports: [TableModule, ButtonModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length === 0) {
      <app-empty-state variant="tasks" subtitle="No projects with weekly tasks yet. Once tasks are added, task-level counts will appear here." />
    } @else {
      <p-table
        [value]="rows()"
        [scrollable]="true"
        scrollHeight="420px"
        stripedRows
      >
        <ng-template pTemplate="header">
          <tr>
            <th>Project</th>
            <th class="num">Total</th>
            <th class="num">Pending</th>
            <th class="num">In Progress</th>
            <th class="num">Delayed</th>
            <th class="num">On Hold</th>
            <th class="num">Done</th>
            <th></th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-r>
          <tr>
            <td>
              <div class="proj-head">
                <span class="client-tag">{{ r.client }}</span>
                <span class="proj-name" [title]="r.displayName">{{ r.displayName }}</span>
              </div>
              <!-- Slim stacked bar — done / in-progress / hold / delayed / pending -->
              <div class="mini-bar" [attr.aria-label]="'Task health breakdown'">
                @if (r.done > 0) {
                  <span class="seg s-done" [style.width.%]="pct(r.done, r.total)" [title]="r.done + ' done'"></span>
                }
                @if (r.inProgress > 0) {
                  <span class="seg s-active" [style.width.%]="pct(r.inProgress, r.total)" [title]="r.inProgress + ' in progress'"></span>
                }
                @if (r.hold > 0) {
                  <span class="seg s-hold" [style.width.%]="pct(r.hold, r.total)" [title]="r.hold + ' on hold'"></span>
                }
                @if (r.delayed > 0) {
                  <span class="seg s-delayed" [style.width.%]="pct(r.delayed, r.total)" [title]="r.delayed + ' delayed'"></span>
                }
                @if (r.pending > 0) {
                  <span class="seg s-pending" [style.width.%]="pct(r.pending, r.total)" [title]="r.pending + ' pending'"></span>
                }
              </div>
            </td>
            <td class="num"><b>{{ r.total }}</b></td>
            <td class="num">
              @if (r.pending > 0) {
                <span class="badge b-gray">{{ r.pending }}</span>
              } @else { <span class="zero">0</span> }
            </td>
            <td class="num">
              @if (r.inProgress > 0) {
                <span class="badge b-blue">{{ r.inProgress }}</span>
              } @else { <span class="zero">0</span> }
            </td>
            <td class="num">
              @if (r.delayed > 0) {
                <span class="badge b-red">{{ r.delayed }}</span>
              } @else { <span class="zero">0</span> }
            </td>
            <td class="num">
              @if (r.hold > 0) {
                <span class="badge b-amber">{{ r.hold }}</span>
              } @else { <span class="zero">0</span> }
            </td>
            <td class="num">
              @if (r.done > 0) {
                <span class="badge b-green">{{ r.done }}</span>
              } @else { <span class="zero">0</span> }
            </td>
            <td>
              <p-button
                icon="pi pi-external-link"
                [rounded]="true"
                [text]="true"
                size="small"
                severity="secondary"
                (onClick)="open.emit(r.projectId)"
              />
            </td>
          </tr>
        </ng-template>
      </p-table>
    }
  `,
  styleUrl: './project-task-breakdown.component.scss',
})
export class ProjectTaskBreakdownComponent {
  readonly rows = input.required<ProjectTaskBreakdownRow[]>();
  readonly open = output<string>();

  protected pct(part: number, total: number): number {
    if (total <= 0) return 0;
    return (part / total) * 100;
  }
}

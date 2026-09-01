import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';

import { EngineerRow } from '@features/dashboard/dashboard-aggregations';

/**
 * Per-engineer stats table. Progress column shows a stacked mini-bar
 * (active / done / hold) so you get portfolio composition at a glance.
 */
@Component({
  selector: 'app-engineer-performance',
  standalone: true,
  imports: [TableModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (rows().length === 0) {
      <div class="empty">
        <i class="pi pi-users text-3xl text-slate-300 block mb-2"></i>
        <div class="text-sm text-slate-500">
          No engineer assignments in the current scope.
        </div>
      </div>
    } @else {
      <p-table
        [value]="rows()"
        [scrollable]="true"
        scrollHeight="420px"
        stripedRows
      >
        <ng-template pTemplate="header">
          <tr>
            <th>Engineer</th>
            <th class="num-col">Total</th>
            <th class="num-col">Active</th>
            <th class="num-col">Done</th>
            <th class="num-col">Hold</th>
            <th class="num-col">Delayed</th>
            <th class="num-col">Not Filled</th>
            <th style="min-width:160px">Progress</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-r>
          <tr>
            <td class="eng-name">{{ r.name }}</td>
            <td class="num-col">
              <span class="badge badge-gray">{{ r.total }}</span>
            </td>
            <td class="num-col">
              <span class="badge badge-blue">{{ r.active }}</span>
            </td>
            <td class="num-col">
              <span class="badge badge-green">{{ r.done }}</span>
            </td>
            <td class="num-col">
              <span class="badge badge-amber">{{ r.hold }}</span>
            </td>
            <td class="num-col">
              <span class="badge" [class.badge-red]="r.delayed > 0" [class.badge-gray]="r.delayed === 0">
                {{ r.delayed }}
              </span>
            </td>
            <td class="num-col">
              <span class="badge" [class.badge-violet]="r.notFilled > 0" [class.badge-gray]="r.notFilled === 0">
                {{ r.notFilled }}
              </span>
            </td>
            <td>
              <div class="prog-wrap">
                <div class="prog-track">
                  <span class="prog-seg seg-active" [style.width.%]="pct(r.active, r.total)"></span>
                  <span class="prog-seg seg-done" [style.width.%]="pct(r.done, r.total)"></span>
                  <span class="prog-seg seg-hold" [style.width.%]="pct(r.hold, r.total)"></span>
                </div>
                <span class="prog-pct">{{ r.progressPct }}%</span>
              </div>
            </td>
          </tr>
        </ng-template>
      </p-table>
    }
  `,
  styleUrl: './engineer-performance.component.scss',
})
export class EngineerPerformanceComponent {
  readonly rows = input.required<EngineerRow[]>();

  protected pct(part: number, total: number): number {
    return total === 0 ? 0 : (part / total) * 100;
  }
}

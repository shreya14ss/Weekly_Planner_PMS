import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';

import { DelayedTaskRow } from '@features/dashboard/dashboard-aggregations';

interface Group {
  key: string;
  client: string;
  projectName: string;
  projectId: string;
  engineers: string[];
  rows: DelayedTaskRow[];
}

/**
 * Focused view of every delayed task in the current scope, grouped
 * by project. Local filters (engineer + client) narrow down without
 * touching the global dashboard filter.
 */
@Component({
  selector: 'app-delayed-tasks-filter',
  standalone: true,
  imports: [FormsModule, SelectModule, ButtonModule, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="hdr">
      <div>
        <h3 class="title">Delayed Tasks — Project Breakdown</h3>
        <p class="sub">Every task currently marked as Delay across active projects.</p>
      </div>
      <div class="filters">
        <p-select
          [options]="engineerOptions()"
          optionLabel="label"
          optionValue="value"
          [ngModel]="engineerFilter()"
          (ngModelChange)="engineerFilter.set($event)"
          placeholder="All Engineers"
          appendTo="body"
          class="filter-sel"
          [showClear]="true"
        />
        <p-select
          [options]="clientOptions()"
          optionLabel="label"
          optionValue="value"
          [ngModel]="clientFilter()"
          (ngModelChange)="clientFilter.set($event)"
          placeholder="All Clients"
          appendTo="body"
          class="filter-sel"
          [showClear]="true"
        />
        <p-tag
          [value]="filteredCount() + ' delayed'"
          severity="danger"
          [rounded]="true"
        />
      </div>
    </header>

    @if (filteredCount() === 0) {
      <div class="empty">
        <i class="pi pi-check-circle text-emerald-500 text-3xl block mb-2"></i>
        <div class="text-sm text-slate-500">
          @if (rows().length === 0) {
            No delayed tasks in the current scope — nice.
          } @else {
            No delayed tasks match your filters.
          }
        </div>
      </div>
    } @else {
      <div class="groups">
        @for (g of groups(); track g.key) {
          <section class="group">
            <header class="g-hdr">
              <span class="client-tag">{{ g.client }}</span>
              <span class="proj">{{ g.projectName }}</span>
              <span class="count">{{ g.rows.length }} delayed</span>
              <span class="eng">{{ g.engineers.join(', ') || 'Unassigned' }}</span>
              <button
                type="button"
                class="open"
                (click)="open.emit(g.projectId)"
                aria-label="Open project"
              >
                <i class="pi pi-external-link"></i>
              </button>
            </header>
            <ul class="rows">
              @for (r of g.rows; track r.taskId) {
                <li class="row">
                  <i class="pi pi-exclamation-triangle text-rose-500"></i>
                  <span class="task-name">{{ r.taskName }}</span>
                  <span class="who">
                    <i class="pi pi-user"></i>
                    {{ r.assigneeNames.length ? r.assigneeNames.join(', ') : g.engineers[0] || 'Unassigned' }}
                  </span>
                  @if (r.daysOverdue) {
                    <span class="days">{{ r.daysOverdue }}d overdue</span>
                  } @else if (r.dueDate) {
                    <span class="due">Due: {{ r.dueDate }}</span>
                  }
                </li>
              }
            </ul>
          </section>
        }
      </div>
    }
  `,
  styleUrl: './delayed-tasks-filter.component.scss',
})
export class DelayedTasksFilterComponent {
  readonly rows = input.required<DelayedTaskRow[]>();
  readonly open = output<string>();

  protected readonly engineerFilter = signal<string | null>(null);
  protected readonly clientFilter = signal<string | null>(null);

  protected readonly engineerOptions = computed(() => {
    const set = new Set<string>();
    for (const r of this.rows()) for (const e of r.engineers) if (e) set.add(e);
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((n) => ({ label: n, value: n }));
  });

  protected readonly clientOptions = computed(() => {
    const set = new Set<string>();
    for (const r of this.rows()) if (r.client) set.add(r.client);
    return Array.from(set)
      .sort((a, b) => a.localeCompare(b))
      .map((c) => ({ label: c, value: c }));
  });

  protected readonly filteredRows = computed(() => {
    const eng = this.engineerFilter();
    const client = this.clientFilter();
    return this.rows().filter((r) => {
      if (client && r.client !== client) return false;
      if (eng && !r.engineers.some((e) => e === eng)) return false;
      return true;
    });
  });

  protected readonly filteredCount = computed(() => this.filteredRows().length);

  protected readonly groups = computed<Group[]>(() => {
    const map = new Map<string, Group>();
    for (const r of this.filteredRows()) {
      const g = map.get(r.projectId) ?? {
        key: r.projectId,
        client: r.client,
        projectName: r.projectName,
        projectId: r.projectId,
        engineers: r.engineers,
        rows: [],
      };
      g.rows.push(r);
      map.set(r.projectId, g);
    }
    return Array.from(map.values()).sort((a, b) => b.rows.length - a.rows.length);
  });
}

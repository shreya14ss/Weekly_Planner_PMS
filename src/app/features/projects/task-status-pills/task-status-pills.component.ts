import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TaskStatus } from '@models/week';

interface StatusOption {
  value: TaskStatus;
  label: string;
  icon: string;
  cls: string;
}

/**
 * Six-state task status selector. Rendered as a horizontal strip of
 * pills where the selected one is emphasised. Pure presentational —
 * emits `change` when the user picks a different status.
 */
@Component({
  selector: 'app-task-status-pills',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="pills" role="radiogroup" aria-label="Task status">
      @for (opt of options; track opt.value) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="opt.value === status()"
          class="pill"
          [class]="opt.cls"
          [class.selected]="opt.value === status()"
          [disabled]="disabled()"
          (click)="pick(opt.value)"

        >
          <i class="pi {{ opt.icon }}"></i>
          {{ opt.label }}
        </button>
      }
    </div>
  `,
  styleUrl: './task-status-pills.component.scss',
  imports: [],
  host: { class: 'block' },
})
export class TaskStatusPillsComponent {
  readonly status = input<TaskStatus>('not-started');
  readonly disabled = input(false);
  readonly statusChange = output<TaskStatus>();

  protected readonly options: StatusOption[] = [
    { value: 'not-started', label: 'Not Started', icon: 'pi-circle', cls: 'p-ns' },
    { value: 'todo', label: 'To Do', icon: 'pi-play', cls: 'p-todo' },
    { value: 'in-progress', label: 'In Progress', icon: 'pi-spinner', cls: 'p-ip' },
    { value: 'completed', label: 'Completed', icon: 'pi-check', cls: 'p-done' },
    { value: 'hold', label: 'On Hold', icon: 'pi-pause', cls: 'p-hold' },
    { value: 'delay', label: 'Delay', icon: 'pi-exclamation-triangle', cls: 'p-del' },
  ];

  pick(v: TaskStatus): void {
    if (this.disabled()) return;
    if (v === this.status()) return;
    this.statusChange.emit(v);
  }
}

import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { MultiSelectModule } from 'primeng/multiselect';

import { UserRepository } from '@core/pouchdb/user.repository';

interface UserOption {
  id: string;
  name: string;
  role: string;
  initials: string;
}

/**
 * Multi-select assignee picker. Consumer supplies the current set of
 * user IDs; emits the new set on change. Non-PM users are the pool —
 * PMs assigning to themselves would be an anti-pattern.
 */
@Component({
  selector: 'app-task-assignees',
  standalone: true,
  imports: [FormsModule, MultiSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-multiSelect
      [options]="options()"
      optionLabel="name"
      optionValue="id"
      [ngModel]="assignees()"
      (ngModelChange)="assigneesChange.emit($event)"
      [disabled]="disabled()"
      display="chip"
      [filter]="true"
      filterBy="name"
      placeholder="Assign to team members…"
      class="w-full"
      appendTo="body"
    >
      <ng-template let-opt pTemplate="item">
        <div class="flex items-center gap-2">
          <span
            class="avatar"
            [class.tl-av]="opt.role === 'tl'"
          >{{ opt.initials }}</span>
          <span class="font-medium">{{ opt.name }}</span>
          <span class="text-xs text-slate-500 ml-auto uppercase tracking-wide">
            {{ opt.role }}
          </span>
        </div>
      </ng-template>
    </p-multiSelect>
  `,
  styles: [
    `
      :host {
        display: block;
      }
      .avatar {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: #2563eb;
        color: #fff;
        font-size: 10px;
        font-weight: 800;
        flex-shrink: 0;
      }
      .avatar.tl-av {
        background: #d97706;
      }
    `,
  ],
})
export class TaskAssigneesComponent {
  private readonly users = inject(UserRepository);

  readonly assignees = input<readonly string[]>([]);
  readonly disabled = input(false);
  readonly assigneesChange = output<string[]>();

  readonly options = computed<UserOption[]>(() =>
    this.users
      .sorted()
      .filter((u) => u.role !== 'pm')
      .map((u) => ({
        id: u._id,
        name: u.name,
        role: u.role,
        initials: this.initials(u.name),
      })),
  );

  private initials(name: string): string {
    return name
      .split(' ')
      .map((w) => w[0] ?? '')
      .join('')
      .slice(0, 2)
      .toUpperCase();
  }
}

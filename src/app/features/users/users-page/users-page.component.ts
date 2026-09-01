import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { CardModule } from 'primeng/card';

import { UserRepository } from '@core/pouchdb/user.repository';

@Component({
  selector: 'app-users-page',
  standalone: true,
  imports: [TableModule, TagModule, CardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-card header="Team Members &amp; Access">
      <p-table [value]="users.sorted()" [paginator]="true" [rows]="10" stripedRows>
        <ng-template pTemplate="header">
          <tr>
            <th>Name</th>
            <th>Role</th>
            <th>PIN</th>
            <th>Email</th>
            <th>Mobile</th>
          </tr>
        </ng-template>
        <ng-template pTemplate="body" let-user>
          <tr>
            <td class="font-semibold">{{ user.name }}</td>
            <td>
              <p-tag
                [value]="user.role.toUpperCase()"
                [severity]="user.role === 'pm' ? 'warn' : user.role === 'tl' ? 'info' : 'secondary'"
              />
            </td>
            <td>
              <code class="bg-slate-100 px-2 py-1 rounded font-mono tracking-widest">{{ user.pin }}</code>
            </td>
            <td class="text-slate-600 text-sm">{{ user.email || '—' }}</td>
            <td class="text-slate-600 text-sm">{{ user.mobile || '—' }}</td>
          </tr>
        </ng-template>
        <ng-template pTemplate="emptymessage">
          <tr>
            <td colspan="5" class="text-center py-10 text-slate-500">
              No users yet — add your team from the "Add User" button (coming soon).
            </td>
          </tr>
        </ng-template>
      </p-table>
    </p-card>
  `,
})
export class UsersPageComponent {
  readonly users = inject(UserRepository);
}

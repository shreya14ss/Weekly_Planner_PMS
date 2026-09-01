import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

import { TableModule } from 'primeng/table';
import { ButtonModule } from 'primeng/button';

import { FollowUpRow, TrackKey } from '@features/dashboard/dashboard-aggregations';

/**
 * Port of legacy renderDayMatrix — "Project Task Status — Who Needs Follow-Up?"
 * One row per project with team avatars, task-progress mini-bar, and
 * a track-status pill.
 */
@Component({
  selector: 'app-project-follow-up',
  standalone: true,
  imports: [TableModule, ButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-follow-up.component.html',
  styleUrl: './project-follow-up.component.scss',
})
export class ProjectFollowUpComponent {
  readonly rows = input.required<FollowUpRow[]>();
  readonly open = output<string>();

  protected trackCls(key: TrackKey): string {
    return `tk-${key}`;
  }

  protected roleCls(role: string): string {
    return `av-${role}`;
  }

  protected roleLabel(role: string): string {
    if (role === 'pm') return 'PM';
    if (role === 'tl') return 'TL';
    if (role === 'user') return 'ENG';
    return '';
  }

  protected segPct(count: number, total: number): number {
    return total === 0 ? 0 : (count / total) * 100;
  }
}

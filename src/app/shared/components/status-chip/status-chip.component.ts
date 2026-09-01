import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { ProjectStatus } from '@models/project';

/**
 * Project-status chip. Maps the 10 canonical statuses to consistent
 * background/foreground colour families. PrimeNG's `severity` only
 * offers 6 semantic slots which isn't enough for our domain.
 */
@Component({
  selector: 'app-status-chip',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span
      class="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      [class]="cls()"
    >
      {{ label() }}
    </span>
  `,
})
export class StatusChipComponent {
  readonly status = input<ProjectStatus | string | undefined>('');

  readonly label = computed(() => {
    const s = this.status();
    return s && s.length > 0 ? s : 'Not Set';
  });

  readonly cls = computed(() => {
    const s = (this.status() ?? '').toLowerCase();
    if (s.includes('in progress')) return 'bg-blue-100 text-blue-800';
    if (s.includes('on hold')) return 'bg-amber-100 text-amber-800';
    if (s.includes('completed')) return 'bg-emerald-100 text-emerald-800';
    if (s.includes('handed over')) return 'bg-emerald-100 text-emerald-800';
    if (s.includes('not started')) return 'bg-slate-100 text-slate-700';
    if (s.includes('testing') || s.includes('validation')) return 'bg-violet-100 text-violet-800';
    if (s.includes('configuration')) return 'bg-rose-100 text-rose-800';
    if (s.includes('savt')) return 'bg-yellow-100 text-yellow-800';
    if (s.includes('survey')) return 'bg-sky-100 text-sky-800';
    return 'bg-slate-100 text-slate-500';
  });
}

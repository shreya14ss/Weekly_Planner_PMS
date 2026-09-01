import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-coming-soon',
  standalone: true,
  imports: [CardModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-card>
      <div class="text-center py-12 px-6">
        <i class="pi pi-hammer text-6xl text-slate-300 mb-4 block"></i>
        <h2 class="text-2xl font-bold text-slate-700 mb-2">{{ title() }}</h2>
        <p class="text-slate-500 text-sm max-w-md mx-auto">{{ description() }}</p>
      </div>
    </p-card>
  `,
})
export class ComingSoonComponent {
  readonly title = input.required<string>();
  readonly description = input<string>('This feature will be built incrementally on top of the scaffolded foundation.');
}

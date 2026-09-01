import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ComingSoonComponent } from '@shared/components/coming-soon.component';

@Component({
  selector: 'app-history-page',
  standalone: true,
  imports: [ComingSoonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-coming-soon title="Activity History" />`,
})
export class HistoryPageComponent {}

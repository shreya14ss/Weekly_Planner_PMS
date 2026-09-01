import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ComingSoonComponent } from '@shared/components/coming-soon.component';

@Component({
  selector: 'app-completed-page',
  standalone: true,
  imports: [ComingSoonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-coming-soon title="Completed Projects" />`,
})
export class CompletedPageComponent {}

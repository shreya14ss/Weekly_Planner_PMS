import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ComingSoonComponent } from '@shared/components/coming-soon.component';

@Component({
  selector: 'app-alerts-page',
  standalone: true,
  imports: [ComingSoonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-coming-soon title="Alerts &amp; Action Items" />`,
})
export class AlertsPageComponent {}

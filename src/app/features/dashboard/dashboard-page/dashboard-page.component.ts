import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ComingSoonComponent } from '@shared/components/coming-soon.component';

@Component({
  selector: 'app-dashboard-page',
  standalone: true,
  imports: [ComingSoonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-coming-soon
    title="Dashboard"
    description="KPI cards, engineer performance matrix, weekly tracker, delayed task filter, TL trend — coming next."
  />`,
})
export class DashboardPageComponent {}

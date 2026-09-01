import { ChangeDetectionStrategy, Component } from '@angular/core';

import { ComingSoonComponent } from '@shared/components/coming-soon.component';

@Component({
  selector: 'app-projects-page',
  standalone: true,
  imports: [ComingSoonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<app-coming-soon
    title="Projects"
    description="Client-grouped project cards, weekly tasks, assignees, carry-forward — coming next."
  />`,
})
export class ProjectsPageComponent {}

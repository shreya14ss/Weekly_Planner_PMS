import { provideAppInitializer, inject, EnvironmentProviders } from '@angular/core';

import { DatabaseService } from './database.service';
import { UserRepository } from './user.repository';
import { ProjectRepository } from './project.repository';
import { WeekStateService } from '@core/services/week-state.service';

/**
 * Boots the local PouchDB and warms up the frequently-read caches
 * (users, projects, current week) before the first navigation resolves.
 * Audit is loaded lazily by the history feature.
 */
export function providePouchDb(): EnvironmentProviders {
  return provideAppInitializer(async () => {
    const db = inject(DatabaseService);
    const users = inject(UserRepository);
    const projects = inject(ProjectRepository);
    const weekState = inject(WeekStateService);

    await db.init();
    await Promise.all([users.init(), projects.init()]);
    await weekState.init();
  });
}

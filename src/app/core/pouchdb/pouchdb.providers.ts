import { provideAppInitializer, inject, EnvironmentProviders } from '@angular/core';

import { DatabaseService } from './database.service';
import { UserRepository } from './user.repository';
import { ProjectRepository } from './project.repository';

/**
 * Boots the local PouchDB and warms up the frequently-read caches
 * (users, projects) before the first navigation resolves. Week docs
 * and audit are loaded lazily by their features.
 */
export function providePouchDb(): EnvironmentProviders {
  return provideAppInitializer(async () => {
    const db = inject(DatabaseService);
    const users = inject(UserRepository);
    const projects = inject(ProjectRepository);

    await db.init();
    await Promise.all([users.init(), projects.init()]);
  });
}

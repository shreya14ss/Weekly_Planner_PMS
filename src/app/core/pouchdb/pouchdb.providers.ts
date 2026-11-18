import { provideAppInitializer, inject, EnvironmentProviders } from '@angular/core';

import { DatabaseService } from './database.service';
import { UserRepository } from './user.repository';
import { ProjectRepository } from './project.repository';
import { ReminderRepository } from './reminder.repository';
import { MeetingRepository } from './meeting.repository';
import { TodoRepository } from './todo.repository';
import { WeekStateService } from '@core/services/week-state.service';
import { ThemeService } from '@core/theme/theme.service';

/**
 * Boots the local PouchDB and warms up the frequently-read caches
 * (users, projects, current week) before the first navigation resolves.
 * Also applies the persisted theme so the shell paints the right
 * colours on first render. Audit is loaded lazily by the history
 * feature.
 */
export function providePouchDb(): EnvironmentProviders {
  return provideAppInitializer(async () => {
    const db = inject(DatabaseService);
    const users = inject(UserRepository);
    const projects = inject(ProjectRepository);
    const reminders = inject(ReminderRepository);
    const meetings = inject(MeetingRepository);
    const todos = inject(TodoRepository);
    const weekState = inject(WeekStateService);
    const theme = inject(ThemeService);

    theme.init();

    await db.init();
    await Promise.all([
      users.init(),
      projects.init(),
      reminders.init(),
      meetings.init(),
      todos.init(),
    ]);
    await weekState.init();
  });
}

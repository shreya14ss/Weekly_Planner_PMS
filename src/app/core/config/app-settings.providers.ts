import { EnvironmentProviders, inject, provideAppInitializer } from '@angular/core';
import { AppSettingsService } from './app-settings.service';

/**
 * Blocks Angular bootstrap until public/app-settings.json is loaded, so
 * every downstream service (DatabaseService, etc.) sees the resolved config.
 * Must be registered BEFORE providers that read AppSettingsService.
 */
export function provideAppSettings(): EnvironmentProviders {
  return provideAppInitializer(async () => {
    const settings = inject(AppSettingsService);
    await settings.load();
  });
}

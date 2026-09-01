import { Injectable, computed, inject, signal } from '@angular/core';

import { ProjectRepository } from '@core/pouchdb/project.repository';
import { AuthService } from '@core/services/auth.service';
import { isProjectVisible } from '@core/services/project-permissions';
import { ProjectDoc } from '@models/project';

/**
 * Encapsulates the "which projects should we show right now" logic for
 * the projects page and the dashboard scopes.
 *
 * The list is derived from:
 *   1. Role-based visibility (from `project-permissions`)
 *   2. An optional engineer filter (PM-only affordance)
 *
 * The result is exposed as a computed signal so consumers stay reactive.
 */
@Injectable({ providedIn: 'root' })
export class ProjectFilterService {
  private readonly projects = inject(ProjectRepository);
  private readonly auth = inject(AuthService);

  /** '' means "no filter"; anything else is a case-insensitive engineer name. */
  readonly engineerFilter = signal<string>('');

  /** Options for the filter dropdown — deduped engineer names, sorted. */
  readonly engineerOptions = computed(() => {
    const set = new Set<string>();
    for (const p of this.projects.all()) {
      for (const e of p.engineers) {
        const trimmed = e.trim();
        if (trimmed) set.add(trimmed);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  });

  /** Visible list after role + engineer filter is applied. */
  readonly filtered = computed<ProjectDoc[]>(() => {
    const user = this.auth.currentUser();
    const engFilter = this.engineerFilter().trim().toLowerCase();

    return this.projects.all().filter((p) => {
      if (!isProjectVisible(user, p)) return false;
      if (!engFilter) return true;
      return p.engineers.some((e) => e.trim().toLowerCase() === engFilter);
    });
  });

  /** Grouped by client, preserving first-seen order of clients. */
  readonly grouped = computed<{ client: string; projects: ProjectDoc[] }[]>(() => {
    const map = new Map<string, ProjectDoc[]>();
    for (const p of this.filtered()) {
      const key = p.client || 'Unknown';
      const bucket = map.get(key);
      if (bucket) bucket.push(p);
      else map.set(key, [p]);
    }
    return Array.from(map, ([client, projects]) => ({ client, projects }));
  });

  reset(): void {
    this.engineerFilter.set('');
  }
}

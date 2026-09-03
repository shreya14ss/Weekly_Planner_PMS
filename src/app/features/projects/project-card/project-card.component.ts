import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  input,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePipe } from '@angular/common';

import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';
import { SelectModule } from 'primeng/select';
import { DatePickerModule } from 'primeng/datepicker';
import { TagModule } from 'primeng/tag';
import { TooltipModule } from 'primeng/tooltip';

import { ProjectDoc, PROJECT_STATUSES, ProjectStatus } from '@models/project';
import { ProjectWeekEntry } from '@models/week';
import { AuthService } from '@core/services/auth.service';
import { WeekStateService } from '@core/services/week-state.service';
import { canEditProject } from '@core/services/project-permissions';
import { toIsoDate } from '@shared/utils/date.util';
import { StatusChipComponent } from '@shared/components/status-chip/status-chip.component';
import { TaskListComponent } from '@features/projects/task-list/task-list.component';

/**
 * A single project row + its expandable weekly form.
 *
 * All edits go through the WeekStateService so save/discard/dirty tracking
 * is centralised. This component is pure UI wiring — it never touches the
 * database directly.
 */
@Component({
  selector: 'app-project-card',
  standalone: true,
  imports: [
    FormsModule,
    DatePipe,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    SelectModule,
    DatePickerModule,
    TagModule,
    TooltipModule,
    StatusChipComponent,
    TaskListComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './project-card.component.html',
  styleUrl: './project-card.component.scss',
})
export class ProjectCardComponent {
  protected readonly auth = inject(AuthService);
  protected readonly state = inject(WeekStateService);

  readonly project = input.required<ProjectDoc>();
  readonly editRequested = output<ProjectDoc>();
  readonly deleteRequested = output<ProjectDoc>();

  protected readonly expanded = signal(false);

  protected readonly entry = computed<ProjectWeekEntry>(
    () => this.state.entryFor(this.project()._id) ?? {},
  );

  protected readonly effectiveStatus = computed<ProjectStatus>(() => {
    const patched = this.entry().status;
    return (patched !== undefined ? patched : this.project().status) ?? '';
  });

  protected readonly canEdit = computed(() => canEditProject(this.auth.currentUser(), this.project()));

  protected readonly isDirty = computed(() => this.state.isDirty(this.project()._id));

  protected readonly displayName = computed(() => {
    const p = this.project();
    return p.name === '—' || !p.name ? `${p.client} Site` : p.name;
  });

  protected readonly engineerLine = computed(() => {
    const p = this.project();
    const tls = new Set(p.tls);
    // Show engineers who are NOT also in the TL list — those are shown separately.
    const others = p.engineers.filter((e) => !tls.has(e));
    return others.join(', ') || (p.tls.length ? '' : 'Unassigned');
  });

  protected readonly statusOptions = PROJECT_STATUSES.filter((s) => s !== '').map((s) => ({
    label: s,
    value: s,
  }));

  protected readonly targetDateValue = computed<Date | null>(() => {
    const iso = this.entry().targetDate;
    return iso ? new Date(iso + 'T00:00:00') : null;
  });

  protected readonly lastEditAt = computed(() => {
    const iso = this.entry()._lastEditAt;
    return iso ? new Date(iso) : null;
  });

  toggle(): void {
    this.expanded.update((v) => !v);
  }

  onEdit(event: Event): void {
    event.stopPropagation();
    this.editRequested.emit(this.project());
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.deleteRequested.emit(this.project());
  }

  onStatusChange(value: ProjectStatus): void {
    if (!this.canEdit()) return;
    this.state.patchEntry(this.project()._id, { status: value });
  }

  onFieldChange<K extends keyof ProjectWeekEntry>(key: K, value: ProjectWeekEntry[K]): void {
    if (!this.canEdit()) return;
    this.state.patchEntry(this.project()._id, { [key]: value } as Pick<ProjectWeekEntry, K>);
  }

  onTargetDateChange(d: Date | null): void {
    if (!this.canEdit()) return;
    // Serialize from LOCAL components — toISOString() shifts to UTC and
    // rolls back to the previous day for any timezone east of UTC (IST etc.).
    const iso = d ? toIsoDate(d) : undefined;
    this.state.patchEntry(this.project()._id, { targetDate: iso });
  }

  async save(): Promise<void> {
    await this.state.saveProject(this.project()._id, this.displayName());
  }

  discard(): void {
    this.state.discardProject(this.project()._id);
  }
}

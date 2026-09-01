import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';

import { ProjectRepository } from '@core/pouchdb/project.repository';
import { UserRepository } from '@core/pouchdb/user.repository';
import { WeekStateService } from '@core/services/week-state.service';
import { ProjectDoc } from '@models/project';
import { ProjectWeekEntry, WeekTask } from '@models/week';
import { formatWeekRange } from '@shared/utils/date.util';

/**
 * Spreadsheet exports for the current dataset. All heavy work stays
 * out of the components — they just call a method with a scope
 * (typically the ProjectFilterService's current filtered list).
 */
@Injectable({ providedIn: 'root' })
export class ExportService {
  private readonly projects = inject(ProjectRepository);
  private readonly users = inject(UserRepository);
  private readonly weekState = inject(WeekStateService);

  /**
   * Weekly report: one row per task (or one placeholder row per project
   * if it has no tasks) with the full context — client, engineers,
   * form fields, task-level detail. Matches the legacy column set so
   * the rest of the team can reuse existing spreadsheet macros.
   */
  exportWeeklyReport(scope: ProjectDoc[] = this.projects.all()): void {
    const week = this.weekState.loadedWeek();
    const entries = this.weekState.entries();
    const rows: (string | number)[][] = [];

    rows.push([`WEEKLY UPDATES — ${formatWeekRange(week)}`]);
    rows.push([
      'S.NO.',
      'Client',
      'Project Name',
      'Assigned Engineers',
      'TLs',
      'Current Status',
      'Target Date',
      'Weekly Target',
      'Work Detailed Description',
      'Status (week)',
      'Remarks',
      'Last Updated By',
      'Last Updated At',
      'Task #',
      'Task Name',
      'Task Status',
      'Task Due Date',
      'Task Remark',
      'Task Assigned To',
      'Task Delayed Days',
    ]);

    scope.forEach((p, i) => {
      const entry = entries[p._id] ?? {};
      const base = this.baseRow(p, entry, i + 1);
      const tasks = entry.weekTasks ?? [];
      if (tasks.length === 0) {
        rows.push([...base, '', '', '', '', '', '']);
        return;
      }
      tasks.forEach((t, ti) => {
        rows.push([...base, ti + 1, ...this.taskCells(t)]);
      });
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 10 },
      { wch: 36 },
      { wch: 30 },
      { wch: 20 },
      { wch: 20 },
      { wch: 13 },
      { wch: 20 },
      { wch: 42 },
      { wch: 18 },
      { wch: 22 },
      { wch: 18 },
      { wch: 18 },
      { wch: 6 },
      { wch: 32 },
      { wch: 14 },
      { wch: 13 },
      { wch: 28 },
      { wch: 22 },
      { wch: 10 },
    ];
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 19 } }];
    XLSX.utils.book_append_sheet(wb, ws, 'Weekly Report');
    XLSX.writeFile(wb, `Weekly_Report_${week.replace(/-/g, '')}.xlsx`);
  }

  /**
   * Project list only — no week data. Same column set as the legacy
   * "Project List" spreadsheet so imports round-trip cleanly.
   */
  exportProjectList(scope: ProjectDoc[] = this.projects.all()): void {
    const rows: (string | number)[][] = [
      [
        'S.NO.',
        'Client',
        'Project Name',
        'Assigned Engineers',
        'TLs',
        'Current Status',
        'Description',
        'Remarks',
      ],
    ];

    scope.forEach((p, i) => {
      rows.push([
        i + 1,
        p.client,
        p.name === '—' ? '' : p.name,
        p.engineers.join(', '),
        p.tls.join(', '),
        p.status ?? '',
        p.desc ?? '',
        p.remarks ?? '',
      ]);
    });

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },
      { wch: 12 },
      { wch: 40 },
      { wch: 35 },
      { wch: 25 },
      { wch: 25 },
      { wch: 40 },
      { wch: 35 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'Project List');
    XLSX.writeFile(wb, 'Project_List.xlsx');
  }

  private baseRow(
    p: ProjectDoc,
    entry: ProjectWeekEntry,
    sno: number,
  ): (string | number)[] {
    return [
      sno,
      p.client,
      p.name === '—' ? '' : p.name,
      p.engineers.join(', '),
      p.tls.join(', '),
      p.status ?? '',
      entry.targetDate ?? '',
      entry.weeklyTarget ?? '',
      entry.description ?? '',
      entry.status ?? '',
      entry.remarks ?? p.remarks ?? '',
      entry._lastEditBy ?? '',
      this.fmtEditedAt(entry._lastEditAt),
    ];
  }

  private taskCells(t: WeekTask): (string | number)[] {
    const assignees = (t.assignedTo ?? [])
      .map((uid) => this.users.get(uid)?.name)
      .filter((n): n is string => !!n)
      .join(', ');
    const delayDays = this.computeDelayDays(t);
    return [
      t.name ?? '',
      t.status ?? '',
      t.taskDueDate ?? '',
      t.remark ?? '',
      assignees,
      delayDays ?? '',
    ];
  }

  private fmtEditedAt(iso: string | undefined): string {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }

  private computeDelayDays(t: WeekTask): number | null {
    const origin = t.originalWeek ?? t.carriedWeek;
    if (!origin) return null;
    const originDate = new Date(origin + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diff = Math.floor((today.getTime() - originDate.getTime()) / 86400000);
    return diff > 0 ? diff : 0;
  }
}

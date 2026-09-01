import { ChangeDetectionStrategy, Component, computed, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import * as XLSX from 'xlsx';

import { CardModule } from 'primeng/card';
import { SelectModule } from 'primeng/select';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { TableModule } from 'primeng/table';

import { HistoryService } from '@features/history/history.service';
import { AuthService } from '@core/services/auth.service';
import { AuditAction, AuditDoc } from '@models/audit';

interface DaysOption {
  label: string;
  value: number;
}

@Component({
  selector: 'app-history-page',
  standalone: true,
  imports: [
    FormsModule,
    CardModule,
    SelectModule,
    ButtonModule,
    TagModule,
    TableModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './history-page.component.html',
  styleUrl: './history-page.component.scss',
})
export class HistoryPageComponent implements OnInit {
  protected readonly history = inject(HistoryService);
  protected readonly auth = inject(AuthService);

  protected readonly daysOptions: DaysOption[] = [
    { label: 'All time', value: 0 },
    { label: 'Last 7 days', value: 7 },
    { label: 'Last 30 days', value: 30 },
    { label: 'Last 90 days', value: 90 },
  ];

  protected readonly userOptions = computed(() => [
    { label: 'All Users', value: 'all' },
    ...this.history.userOptions().map((u) => ({ label: u.name, value: u.id })),
  ]);

  protected readonly actionOptions = computed(() => [
    { label: 'All Actions', value: 'all' as const },
    ...this.history.actionOptions.map((a) => ({ label: a, value: a })),
  ]);

  async ngOnInit(): Promise<void> {
    if (!this.history.loaded()) await this.history.load();
  }

  protected fmtDate(iso: string): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return (
      d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' +
      d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false })
    );
  }

  protected actionSeverity(action: AuditAction): 'success' | 'info' | 'warn' | 'danger' | 'secondary' {
    if (action.includes('Added')) return 'success';
    if (action.includes('Deleted')) return 'danger';
    if (action === 'Login' || action === 'Logout') return 'secondary';
    if (action.includes('Assigned')) return 'info';
    return 'warn';
  }

  protected roleClass(role: string): string {
    if (role === 'pm') return 'role-pm';
    if (role === 'tl') return 'role-tl';
    return 'role-user';
  }

  protected roleLabel(role: string): string {
    return (role || 'user').toUpperCase();
  }

  async clearHistory(): Promise<void> {
    if (this.auth.role() !== 'pm') return;
    if (!confirm('Clear ALL audit history? This cannot be undone.')) return;
    await this.history.clearAll();
  }

  exportExcel(): void {
    const rows: (string | number)[][] = [
      ['Date', 'Time', 'User', 'Role', 'Action', 'Project', 'Detail', 'Old Value', 'New Value'],
    ];
    for (const e of this.history.filtered()) {
      const d = new Date(e.ts);
      const valid = !isNaN(d.getTime());
      rows.push([
        valid ? d.toLocaleDateString('en-IN') : e.ts,
        valid ? d.toLocaleTimeString('en-IN') : '',
        e.userName,
        e.role,
        e.action,
        e.project ?? '',
        e.detail ?? '',
        e.oldVal ?? '',
        e.newVal ?? '',
      ]);
    }
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [
      { wch: 12 },
      { wch: 10 },
      { wch: 22 },
      { wch: 8 },
      { wch: 22 },
      { wch: 28 },
      { wch: 40 },
      { wch: 24 },
      { wch: 24 },
    ];
    XLSX.utils.book_append_sheet(wb, ws, 'History');
    XLSX.writeFile(wb, 'Activity_History.xlsx');
  }

  protected trackById(_: number, e: AuditDoc): string {
    return e._id;
  }
}

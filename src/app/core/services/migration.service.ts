import { Injectable, inject } from '@angular/core';
import * as XLSX from 'xlsx';

import { DatabaseService } from '@core/pouchdb/database.service';
import { UserRepository } from '@core/pouchdb/user.repository';
import { ProjectRepository } from '@core/pouchdb/project.repository';
import { WeekRepository } from '@core/pouchdb/week.repository';
import { idOf } from '@core/pouchdb/id-utils';
import { UserDoc, UserRole } from '@models/user';
import { ProjectDoc, ProjectStatus, PROJECT_STATUSES } from '@models/project';
import { ProjectWeekEntry, TaskStatus, WeekTask } from '@models/week';
import { AuditDoc, AuditAction } from '@models/audit';
import { mondayOf } from '@shared/utils/date.util';

export interface ImportPreview {
  projects: number;
  users: number;
  weeks: number;
  audit: number;
  warnings: string[];
}

export interface ImportResult extends ImportPreview {
  written: number;
  errors: string[];
}

export type MergeMode = 'merge' | 'replace';

/** Firebase RTDB export shape — only the bits we care about. */
interface FirebaseExport {
  projects?: FbProject[];
  users?: FbUser[];
  audit?: FbAudit[];
  weeks?: Record<string, Record<string, FbWeekEntry | null> | null>;
}

interface FbProject {
  id: number | string;
  client?: string;
  name?: string;
  engineers?: string[];
  tls?: string[];
  status?: string;
  desc?: string;
  remarks?: string;
}

interface FbUser {
  id: string;
  name?: string;
  role?: string;
  pin?: string;
  email?: string;
  mobile?: string;
}

interface FbAudit {
  id: string;
  ts?: string;
  userId?: string;
  userName?: string;
  role?: string;
  action?: string;
  project?: string;
  detail?: string;
  oldVal?: string;
  newVal?: string;
}

interface FbWeekEntry {
  targetDate?: string;
  weeklyTarget?: string;
  description?: string;
  status?: string;
  remarks?: string;
  weekTasks?: unknown[];
  _lastEditBy?: string;
  _lastEditAt?: string;
}

const VALID_STATUSES = new Set<string>(PROJECT_STATUSES);
const VALID_ROLES = new Set<UserRole>(['pm', 'tl', 'user']);
const VALID_TASK_STATUSES = new Set<TaskStatus>([
  'not-started',
  'todo',
  'in-progress',
  'completed',
  'hold',
  'delay',
]);
const VALID_AUDIT_ACTIONS = new Set<string>([
  'Login',
  'Logout',
  'Project Added',
  'Project Edited',
  'Project Deleted',
  'User Added',
  'User Edited',
  'User Deleted',
  'Task Added',
  'Task Deleted',
  'Task Name Changed',
  'Task Status Changed',
  'Task Assigned',
  'Task Unassigned',
  'Task Moved',
  'Form Updated',
  'Pending Task Reassigned',
]);

/**
 * One-shot data import from the legacy Firebase RTDB JSON export and
 * the two Excel spreadsheets (Project_List, Team_Users).
 *
 * All parse-only entry points return an ImportPreview so the UI can
 * confirm before committing. Import methods are idempotent when
 * `mode = 'merge'` because IDs are derived deterministically from
 * legacy identifiers.
 */
@Injectable({ providedIn: 'root' })
export class MigrationService {
  private readonly db = inject(DatabaseService);
  private readonly users = inject(UserRepository);
  private readonly projects = inject(ProjectRepository);
  private readonly weekRepo = inject(WeekRepository);

  /* ------------------------------------------------------------------
   * Firebase JSON
   * ---------------------------------------------------------------- */

  parseFirebaseJson(raw: unknown): { data: FirebaseExport; preview: ImportPreview } {
    const warnings: string[] = [];
    if (!raw || typeof raw !== 'object') {
      throw new Error('File is not a JSON object.');
    }
    const data = raw as FirebaseExport;
    const projectsN = Array.isArray(data.projects) ? data.projects.length : 0;
    const usersN = Array.isArray(data.users) ? data.users.length : 0;
    const auditN = Array.isArray(data.audit) ? data.audit.length : 0;
    const weeksN = data.weeks ? Object.keys(data.weeks).length : 0;

    if (!projectsN) warnings.push('No projects found in this file.');
    if (!usersN) warnings.push('No users found in this file.');

    return {
      data,
      preview: {
        projects: projectsN,
        users: usersN,
        weeks: weeksN,
        audit: auditN,
        warnings,
      },
    };
  }

  async importFirebaseJson(data: FirebaseExport, mode: MergeMode): Promise<ImportResult> {
    const result: ImportResult = {
      projects: 0,
      users: 0,
      weeks: 0,
      audit: 0,
      warnings: [],
      written: 0,
      errors: [],
    };

    if (mode === 'replace') {
      await this.clearAll(['user', 'project', 'week', 'audit']);
    }

    // --- Users first: build a legacy→new id map for downstream references
    const userIdMap = new Map<string, string>();
    for (const u of data.users ?? []) {
      try {
        const newId = this.userIdFor(u.id);
        userIdMap.set(u.id, newId);
        const role = this.coerceRole(u.role);
        const doc: UserDoc = {
          _id: newId,
          docType: 'user',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          name: (u.name ?? '').trim() || '(unnamed)',
          role,
          pin: this.coercePin(u.pin),
          email: u.email ?? '',
          mobile: u.mobile ?? '',
        };
        await this.db.put(doc);
        result.users++;
        result.written++;
      } catch (err) {
        result.errors.push(`User ${u.id}: ${(err as Error).message}`);
      }
    }

    // --- Projects: legacy numeric id → deterministic pouch id
    const projectIdMap = new Map<string, string>();
    for (const p of data.projects ?? []) {
      try {
        const legacyKey = String(p.id);
        const newId = this.projectIdFor(legacyKey);
        projectIdMap.set(legacyKey, newId);
        const doc: ProjectDoc = {
          _id: newId,
          docType: 'project',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          client: (p.client ?? '').trim() || 'Unknown',
          name: (p.name ?? '').trim() || '—',
          engineers: Array.isArray(p.engineers) ? p.engineers.filter(Boolean) : [],
          tls: Array.isArray(p.tls) ? p.tls.filter(Boolean) : [],
          status: this.coerceStatus(p.status),
          desc: p.desc ?? '',
          remarks: p.remarks ?? '',
        };
        await this.db.put(doc);
        result.projects++;
        result.written++;
      } catch (err) {
        result.errors.push(`Project ${p.id}: ${(err as Error).message}`);
      }
    }

    // --- Weeks: remap project + user ids inside each entry
    for (const [rawWeek, weekObj] of Object.entries(data.weeks ?? {})) {
      if (!weekObj) continue;
      const weekStart = mondayOf(rawWeek);
      try {
        const entries: Record<string, ProjectWeekEntry> = {};
        for (const [legacyPid, entry] of Object.entries(weekObj)) {
          if (!entry) continue;
          const newPid = projectIdMap.get(legacyPid) ?? this.projectIdFor(legacyPid);
          entries[newPid] = this.remapEntry(entry, userIdMap);
        }
        if (Object.keys(entries).length === 0) continue;
        await this.weekRepo.save(weekStart, entries);
        result.weeks++;
        result.written++;
      } catch (err) {
        result.errors.push(`Week ${rawWeek}: ${(err as Error).message}`);
      }
    }

    // --- Audit log
    for (const a of data.audit ?? []) {
      try {
        const legacyId = a.id ?? `${a.ts}-${a.userId}`;
        const ts = a.ts ?? new Date().toISOString();
        const doc: AuditDoc = {
          _id: idOf('audit', 'legacy-' + legacyId),
          docType: 'audit',
          createdAt: ts,
          updatedAt: ts,
          ts,
          userId: userIdMap.get(a.userId ?? '') ?? a.userId ?? '',
          userName: a.userName ?? '',
          role: this.coerceRole(a.role),
          action: this.coerceAuditAction(a.action),
          project: a.project ?? '',
          detail: a.detail ?? '',
          oldVal: a.oldVal ?? '',
          newVal: a.newVal ?? '',
        };
        await this.db.put(doc);
        result.audit++;
        result.written++;
      } catch (err) {
        result.errors.push(`Audit ${a.id}: ${(err as Error).message}`);
      }
    }

    await this.refreshCaches();
    return result;
  }

  /* ------------------------------------------------------------------
   * Excel imports
   * ---------------------------------------------------------------- */

  parseProjectsExcel(wb: XLSX.WorkBook): { rows: string[][]; preview: ImportPreview } {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false });
    const [, ...data] = rows;
    const valid = data.filter((r) => r?.[1] || r?.[2]); // client or name
    return {
      rows: valid,
      preview: {
        projects: valid.length,
        users: 0,
        weeks: 0,
        audit: 0,
        warnings: valid.length === 0 ? ['No project rows detected.'] : [],
      },
    };
  }

  async importProjectsExcel(rows: string[][], mode: MergeMode): Promise<ImportResult> {
    const result: ImportResult = {
      projects: 0,
      users: 0,
      weeks: 0,
      audit: 0,
      warnings: [],
      written: 0,
      errors: [],
    };

    if (mode === 'replace') {
      await this.clearAll(['project']);
    }

    for (const r of rows) {
      try {
        const [sno, client, name, engineersRaw, status, desc, remarks] = r;
        const legacyKey = String(sno || `${client}-${name}`).trim();
        const doc: ProjectDoc = {
          _id: this.projectIdFor(legacyKey),
          docType: 'project',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          client: (client ?? '').trim() || 'Unknown',
          name: (name ?? '').trim() || '—',
          engineers: (engineersRaw ?? '')
            .split(/[,\n]+/)
            .map((e) => e.trim())
            .filter(Boolean),
          tls: [],
          status: this.coerceStatus(status),
          desc: desc ?? '',
          remarks: remarks ?? '',
        };
        await this.db.put(doc);
        result.projects++;
        result.written++;
      } catch (err) {
        result.errors.push(`Row ${r[0]}: ${(err as Error).message}`);
      }
    }

    await this.projects.init();
    return result;
  }

  parseUsersExcel(wb: XLSX.WorkBook): { rows: string[][]; preview: ImportPreview } {
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, defval: '', raw: false });
    const [, ...data] = rows;
    const valid = data.filter((r) => (r?.[0] ?? '').toString().trim());
    return {
      rows: valid,
      preview: {
        projects: 0,
        users: valid.length,
        weeks: 0,
        audit: 0,
        warnings: valid.length === 0 ? ['No user rows detected.'] : [],
      },
    };
  }

  async importUsersExcel(rows: string[][], mode: MergeMode): Promise<ImportResult> {
    const result: ImportResult = {
      projects: 0,
      users: 0,
      weeks: 0,
      audit: 0,
      warnings: [],
      written: 0,
      errors: [],
    };

    if (mode === 'replace') {
      await this.clearAll(['user']);
    }

    for (const r of rows) {
      try {
        const [name, role, pin, email, mobile] = r;
        const nameStr = (name ?? '').toString().trim();
        if (!nameStr) continue;
        const legacyKey = nameStr.toLowerCase().replace(/[^a-z0-9]/g, '_');
        const doc: UserDoc = {
          _id: this.userIdFor(legacyKey),
          docType: 'user',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          name: nameStr,
          role: this.coerceRole(role),
          pin: this.coercePin(pin),
          email: (email ?? '').toString(),
          mobile: (mobile ?? '').toString(),
        };
        await this.db.put(doc);
        result.users++;
        result.written++;
      } catch (err) {
        result.errors.push(`User ${r[0]}: ${(err as Error).message}`);
      }
    }

    await this.users.init();
    return result;
  }

  /* ------------------------------------------------------------------
   * Utilities
   * ---------------------------------------------------------------- */

  /**
   * Deterministic user id. Special-cases the seeded PM so re-imports
   * don't leave two PMs lying around.
   */
  private userIdFor(legacyId: string): string {
    const key = (legacyId ?? '').trim();
    if (!key || key === 'pm') return idOf('user', 'pm');
    return idOf('user', 'legacy-' + key);
  }

  private projectIdFor(legacyKey: string): string {
    return idOf('project', 'legacy-' + legacyKey.trim());
  }

  private coerceRole(raw: unknown): UserRole {
    const s = String(raw ?? '').toLowerCase();
    if (s === 'engineer') return 'user';
    return VALID_ROLES.has(s as UserRole) ? (s as UserRole) : 'user';
  }

  private coerceStatus(raw: unknown): ProjectStatus {
    const s = String(raw ?? '').trim();
    return VALID_STATUSES.has(s) ? (s as ProjectStatus) : '';
  }

  private coerceAuditAction(raw: unknown): AuditAction {
    const s = String(raw ?? '').trim();
    return VALID_AUDIT_ACTIONS.has(s) ? (s as AuditAction) : 'Form Updated';
  }

  private coercePin(raw: unknown): string {
    const s = String(raw ?? '').trim();
    if (!s) return '1234';
    // Preserve leading zeros — Excel loves to eat them.
    return /^\d+$/.test(s) ? s.padStart(4, '0') : s.slice(0, 8);
  }

  private remapEntry(
    src: FbWeekEntry,
    userIdMap: Map<string, string>,
  ): ProjectWeekEntry {
    const weekTasks = Array.isArray(src.weekTasks)
      ? src.weekTasks
          .filter((t): t is Record<string, unknown> => !!t && typeof t === 'object')
          .map((t) => this.remapTask(t, userIdMap))
      : undefined;

    return {
      targetDate: src.targetDate || undefined,
      weeklyTarget: src.weeklyTarget || undefined,
      description: src.description || undefined,
      status: this.coerceStatus(src.status) || undefined,
      remarks: src.remarks || undefined,
      weekTasks,
      _lastEditBy: src._lastEditBy || undefined,
      _lastEditAt: src._lastEditAt || undefined,
    };
  }

  private remapTask(t: Record<string, unknown>, userIdMap: Map<string, string>): WeekTask {
    const assignedRaw = Array.isArray(t['assignedTo']) ? (t['assignedTo'] as string[]) : [];
    return {
      id: String(t['id'] ?? 'wt_' + Math.random().toString(36).slice(2, 10)),
      name: String(t['name'] ?? ''),
      status: this.coerceTaskStatus(t['status']),
      remark: t['remark'] ? String(t['remark']) : undefined,
      assignedTo: assignedRaw.map((uid) => userIdMap.get(uid) ?? this.userIdFor(uid)).filter(Boolean),
      taskDueDate: t['taskDueDate'] ? String(t['taskDueDate']) : undefined,
      carriedFrom: t['carriedFrom'] ? String(t['carriedFrom']) : undefined,
      carriedWeek: t['carriedWeek'] ? String(t['carriedWeek']) : undefined,
      originalWeek: t['originalWeek'] ? String(t['originalWeek']) : undefined,
    };
  }

  private coerceTaskStatus(raw: unknown): TaskStatus {
    const s = String(raw ?? '').trim() as TaskStatus;
    return VALID_TASK_STATUSES.has(s) ? s : 'not-started';
  }

  private async clearAll(types: ('user' | 'project' | 'week' | 'audit')[]): Promise<void> {
    for (const type of types) {
      const docs = await this.db.allByType(type);
      for (const doc of docs) {
        // Keep the seeded PM so the app never locks itself out on 'replace'.
        if (doc._id === idOf('user', 'pm')) continue;
        await this.db.remove(doc);
      }
    }
  }

  private async refreshCaches(): Promise<void> {
    // The repositories subscribe to the change feed and update in real
    // time, but a bulk import fires so fast we call init() to force a
    // full snapshot re-read to be safe.
    await Promise.all([this.users.init(), this.projects.init()]);
  }
}


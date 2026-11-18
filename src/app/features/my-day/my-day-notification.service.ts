import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';

import { AuthService } from '@core/services/auth.service';
import { ReminderRepository } from '@core/pouchdb/reminder.repository';
import { MeetingRepository } from '@core/pouchdb/meeting.repository';
import { todayIso } from '@shared/utils/date.util';

type PermissionState = 'default' | 'granted' | 'denied' | 'unsupported';

const SOUND_PREF_KEY = 'wpr_reminder_sound';

interface Scheduled {
  timer: ReturnType<typeof setTimeout>;
  /** Absolute epoch-ms the timer is set to fire at — kept so we can
   *  detect when an item's time has changed and reschedule. */
  fireAt: number;
}

/**
 * Fires browser notifications for My Day items that have a time of day:
 *
 *   - Timed reminders — fire at `dueAt + dueTime`.
 *   - Meetings — fire at `dateIso + startTime` (the meeting start).
 *
 * One service, two scheduled maps so each item type reschedules
 * independently. Everything runs through a single `effect()` that
 * reconciles timers whenever reminders, meetings, or the current user
 * changes. Snoozing, editing, deleting, or completing an item is picked
 * up by the next reconcile pass.
 *
 * Deliberate scope limits:
 *   - If the browser or tab is closed when a timer fires, nothing happens
 *     (no service worker / push server). The item still shows in My Day
 *     the next time it's opened.
 *   - Only timed items get notified. Whole-day reminders / meetings
 *     without a start time are visual-only.
 */
@Injectable({ providedIn: 'root' })
export class MyDayNotificationService {
  private readonly auth = inject(AuthService);
  private readonly reminders = inject(ReminderRepository);
  private readonly meetings = inject(MeetingRepository);
  private readonly destroyRef = inject(DestroyRef);

  private readonly scheduledReminders = new Map<string, Scheduled>();
  private readonly scheduledMeetings = new Map<string, Scheduled>();

  private readonly supported =
    typeof window !== 'undefined' && 'Notification' in window;

  private readonly _permission = signal<PermissionState>(this.readPermission());

  readonly permission = this._permission.asReadonly();
  readonly canPrompt = computed(() => this._permission() === 'default');
  readonly isEnabled = computed(() => this._permission() === 'granted');

  private readonly _soundEnabled = signal<boolean>(this.readSoundPref());
  readonly soundEnabled = this._soundEnabled.asReadonly();

  /** Lazily-created AudioContext — browsers require a user gesture
   *  before any audio can play, so we never construct this up-front. */
  private audioCtx?: AudioContext;

  constructor() {
    effect(() => {
      // Touch signals so Angular tracks them as dependencies. Any CRUD
      // on reminders / meetings re-runs reconcile automatically.
      this.reminders.all();
      this.meetings.all();
      this.auth.currentUser();
      this.reconcile();
    });

    this.destroyRef.onDestroy(() => this.clearAll());
  }

  async requestPermission(): Promise<PermissionState> {
    if (!this.supported) return 'unsupported';
    try {
      const result = await Notification.requestPermission();
      this._permission.set(result as PermissionState);
      // The Enable click is a user gesture — a good moment to prime
      // the AudioContext so later programmatic chimes aren't blocked.
      this.ensureAudio();
      this.reconcile();
      return result as PermissionState;
    } catch {
      return this._permission();
    }
  }

  setSoundEnabled(on: boolean): void {
    this._soundEnabled.set(on);
    try {
      localStorage.setItem(SOUND_PREF_KEY, on ? '1' : '0');
    } catch {
      // Storage can be blocked (private mode, quota). Preference is
      // kept in memory for the session — not a crisis.
    }
    if (on) this.ensureAudio();
  }

  /** Fires a notification chime via Web Audio — an ascending three-tone
   *  phrase (A5 → E6 → A6), total ~1.5 seconds. Safe to call from
   *  anywhere — no-ops silently if audio can't start. */
  playChime(): void {
    if (!this._soundEnabled()) return;
    const ctx = this.ensureAudio();
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      this.beep(ctx, 880,  now,        0.55);
      this.beep(ctx, 1319, now + 0.35, 0.55);
      this.beep(ctx, 1760, now + 0.70, 0.85);
    } catch {
      // Audio context may be suspended / lost — nothing actionable.
    }
  }

  private beep(ctx: AudioContext, freq: number, startAt: number, dur: number): void {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const peak = 0.22;
    const sustainUntil = startAt + dur * 0.55;
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(peak, startAt + 0.025);
    gain.gain.setValueAtTime(peak, sustainUntil);
    gain.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + dur + 0.05);
  }

  private ensureAudio(): AudioContext | undefined {
    if (!this.supported) return undefined;
    const Ctor =
      (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext })
        .AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return undefined;
    if (!this.audioCtx) {
      try {
        this.audioCtx = new Ctor();
      } catch {
        return undefined;
      }
    }
    if (this.audioCtx.state === 'suspended') {
      void this.audioCtx.resume().catch(() => undefined);
    }
    return this.audioCtx;
  }

  private readSoundPref(): boolean {
    try {
      const raw = localStorage.getItem(SOUND_PREF_KEY);
      return raw !== '0';
    } catch {
      return true;
    }
  }

  private readPermission(): PermissionState {
    if (!this.supported) return 'unsupported';
    return Notification.permission as PermissionState;
  }

  private reconcile(): void {
    if (!this.supported) return;
    if (this._permission() !== 'granted') {
      this.clearAll();
      return;
    }

    const uid = this.auth.currentUser()?.id;
    if (!uid) {
      this.clearAll();
      return;
    }

    const now = Date.now();
    const today = todayIso();

    this.reconcileReminders(uid, now, today);
    this.reconcileMeetings(uid, now, today);
  }

  private reconcileReminders(uid: string, now: number, today: string): void {
    const needed = new Map<string, number>();

    for (const r of this.reminders.all()) {
      if (r.userId !== uid) continue;
      if (r.done) continue;
      if (r.dueAt !== today) continue;
      if (!r.dueTime) continue;
      const fireAt = this.resolveFireAt(r.dueAt, r.dueTime);
      if (fireAt <= now) continue;
      needed.set(r._id, fireAt);
    }

    this.diffAndSchedule(this.scheduledReminders, needed, now, (id) =>
      this.fireReminder(id),
    );
  }

  private reconcileMeetings(uid: string, now: number, today: string): void {
    const needed = new Map<string, number>();

    for (const m of this.meetings.all()) {
      if (m.userId !== uid) continue;
      if (m.dateIso !== today) continue;
      if (!m.startTime) continue;
      const fireAt = this.resolveFireAt(m.dateIso, m.startTime);
      if (fireAt <= now) continue;
      needed.set(m._id, fireAt);
    }

    this.diffAndSchedule(this.scheduledMeetings, needed, now, (id) =>
      this.fireMeeting(id),
    );
  }

  /** Shared diff: drop stale timers, add missing ones. The `fire` callback
   *  is the item-type-specific notification handler. */
  private diffAndSchedule(
    scheduled: Map<string, Scheduled>,
    needed: Map<string, number>,
    now: number,
    fire: (id: string) => void,
  ): void {
    for (const [id, s] of scheduled) {
      if (!needed.has(id) || needed.get(id) !== s.fireAt) {
        clearTimeout(s.timer);
        scheduled.delete(id);
      }
    }
    for (const [id, fireAt] of needed) {
      if (scheduled.has(id)) continue;
      const timer = setTimeout(() => fire(id), Math.max(0, fireAt - now));
      scheduled.set(id, { timer, fireAt });
    }
  }

  private fireReminder(reminderId: string): void {
    this.scheduledReminders.delete(reminderId);
    if (!this.supported || Notification.permission !== 'granted') return;

    const doc = this.reminders.get(reminderId);
    if (!doc || doc.done) return;

    try {
      const n = new Notification('Reminder', {
        body: doc.text,
        tag: reminderId,
      });
      n.onclick = () => {
        try { window.focus(); } catch { /* Some browsers block focus() here. */ }
        n.close();
      };
    } catch {
      // Firing can throw in rare environments. Nothing actionable.
    }

    this.playChime();
  }

  private fireMeeting(meetingId: string): void {
    this.scheduledMeetings.delete(meetingId);
    if (!this.supported || Notification.permission !== 'granted') return;

    const doc = this.meetings.get(meetingId);
    if (!doc) return;

    const subtitle = [doc.startTime, doc.location].filter(Boolean).join(' · ');
    const body = subtitle ? `${subtitle}\n${doc.title}` : doc.title;

    try {
      const n = new Notification('Meeting now', {
        body,
        tag: meetingId,
      });
      n.onclick = () => {
        try { window.focus(); } catch { /* Some browsers block focus() here. */ }
        n.close();
      };
    } catch {
      // Firing can throw in rare environments. Nothing actionable.
    }

    this.playChime();
  }

  private resolveFireAt(iso: string, hhmm: string): number {
    const [hh, mm] = hhmm.split(':').map((n) => Number(n));
    const [y, m, d] = iso.split('-').map((n) => Number(n));
    return new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0).getTime();
  }

  private clearAll(): void {
    for (const s of this.scheduledReminders.values()) clearTimeout(s.timer);
    this.scheduledReminders.clear();
    for (const s of this.scheduledMeetings.values()) clearTimeout(s.timer);
    this.scheduledMeetings.clear();
  }
}

import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type EmptyStateVariant =
  | 'trend'
  | 'check'
  | 'inbox'
  | 'users'
  | 'tasks'
  | 'chart';

/**
 * Shared "No data available" empty state. Every dashboard section
 * renders through this component so the look, spacing, and glyph
 * language are consistent — no per-component divergence.
 *
 * Pick a `variant` for the glyph (defaults to the generic inbox
 * illustration); `title` overrides the primary line ("No data
 * available" by default); `subtitle` is optional context.
 */
@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="empty">
      <svg viewBox="0 0 64 64" width="52" height="52" aria-hidden="true">
        @switch (variant()) {
          @case ('trend') {
            <path
              d="M6 44 L20 30 L30 38 L44 20 L58 26"
              fill="none" stroke="#cbd5e1" stroke-width="3"
              stroke-linecap="round" stroke-linejoin="round"
            />
            <circle cx="20" cy="30" r="2.5" fill="#cbd5e1" />
            <circle cx="30" cy="38" r="2.5" fill="#cbd5e1" />
            <circle cx="44" cy="20" r="2.5" fill="#cbd5e1" />
            <circle cx="58" cy="26" r="2.5" fill="#cbd5e1" />
          }
          @case ('check') {
            <circle cx="32" cy="32" r="22" fill="none" stroke="#cbd5e1" stroke-width="3" />
            <path
              d="M22 32 L29 39 L43 25"
              fill="none" stroke="#cbd5e1" stroke-width="3"
              stroke-linecap="round" stroke-linejoin="round"
            />
          }
          @case ('users') {
            <circle cx="24" cy="24" r="8" fill="none" stroke="#cbd5e1" stroke-width="3" />
            <circle cx="42" cy="26" r="6" fill="none" stroke="#cbd5e1" stroke-width="3" />
            <path
              d="M10 50 c0 -8 6 -14 14 -14 c8 0 14 6 14 14"
              fill="none" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"
            />
            <path
              d="M38 46 c0 -6 4 -10 10 -10 c6 0 10 4 10 10"
              fill="none" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"
            />
          }
          @case ('tasks') {
            <rect x="12" y="10" width="40" height="44" rx="4"
              fill="none" stroke="#cbd5e1" stroke-width="3" />
            <path d="M20 22 L44 22" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round" />
            <path d="M20 32 L38 32" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round" />
            <path d="M20 42 L34 42" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round" />
          }
          @case ('chart') {
            <rect x="10" y="34" width="10" height="20" rx="2"
              fill="none" stroke="#cbd5e1" stroke-width="3" />
            <rect x="27" y="22" width="10" height="32" rx="2"
              fill="none" stroke="#cbd5e1" stroke-width="3" />
            <rect x="44" y="14" width="10" height="40" rx="2"
              fill="none" stroke="#cbd5e1" stroke-width="3" />
          }
          @default {
            <rect x="10" y="18" width="44" height="32" rx="4"
              fill="none" stroke="#cbd5e1" stroke-width="3" />
            <path d="M10 30 L22 30 L26 36 L38 36 L42 30 L54 30"
              fill="none" stroke="#cbd5e1" stroke-width="3"
              stroke-linecap="round" stroke-linejoin="round" />
          }
        }
      </svg>
      <div class="empty-txt">{{ title() }}</div>
      @if (subtitle()) {
        <div class="empty-sub">{{ subtitle() }}</div>
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 6px;
      min-height: 200px;
      padding: 22px 12px;
      border-radius: 12px;
      background:
        radial-gradient(circle at 50% 45%, #f0fdf4 0%, #f8fafc 55%, #ffffff 100%);
      text-align: center;
    }
    .empty-txt {
      font-size: 15px;
      font-weight: 700;
      color: #94a3b8;
      letter-spacing: 0.01em;
      margin-top: 4px;
    }
    .empty-sub {
      font-size: 12px;
      color: #cbd5e1;
      max-width: 340px;
    }
  `],
})
export class EmptyStateComponent {
  readonly variant = input<EmptyStateVariant>('inbox');
  readonly title = input<string>('No data available');
  readonly subtitle = input<string | undefined>(undefined);
}

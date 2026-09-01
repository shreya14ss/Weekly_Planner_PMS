import { ChangeDetectionStrategy, Component, inject } from '@angular/core';

import { TooltipModule } from 'primeng/tooltip';

import { ThemeService } from '@core/theme/theme.service';
import { ThemeName } from '@core/theme/theme-presets';

/**
 * Five-dot theme picker for the app-shell header. Each dot is a
 * gradient of the theme's shell colour and accent so the swatches
 * preview accurately.
 */
@Component({
  selector: 'app-theme-switcher',
  standalone: true,
  imports: [TooltipModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="switcher" role="radiogroup" aria-label="Colour theme">
      @for (t of theme.themes; track t.name) {
        <button
          type="button"
          role="radio"
          [attr.aria-checked]="theme.current() === t.name"
          [attr.aria-label]="t.label + ' theme'"
          class="dot"
          [class.active]="theme.current() === t.name"
          [style.background]="gradientFor(t.swatches)"
          [pTooltip]="t.label + ' — ' + t.desc"
          tooltipPosition="bottom"
          (click)="pick(t.name)"
        >
          <span class="sr-only">{{ t.label }}</span>
        </button>
      }
    </div>
  `,
  styleUrl: './theme-switcher.component.scss',
})
export class ThemeSwitcherComponent {
  protected readonly theme = inject(ThemeService);

  protected pick(name: ThemeName): void {
    this.theme.apply(name);
  }

  protected gradientFor(sw: readonly [string, string]): string {
    return `linear-gradient(135deg, ${sw[0]} 50%, ${sw[1]} 50%)`;
  }
}

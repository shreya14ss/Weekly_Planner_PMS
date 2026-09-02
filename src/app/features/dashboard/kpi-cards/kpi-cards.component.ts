import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Kpis } from '@features/dashboard/dashboard-aggregations';

interface KpiTile {
  key: keyof Kpis;
  label: string;
  sub: string;
  accent: string; // brand colour for text + border rail
  tint: string; // soft background tint
  icon: string; // pi-* class name
}

/**
 * Six primary KPI tiles. Each card carries a soft tinted background, a
 * left-side accent rail, and a large translucent glyph anchored top-right
 * so metrics read visually — not just as a number in a box.
 */
@Component({
  selector: 'app-kpi-cards',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      @for (tile of tiles; track tile.key) {
        <article
          class="kpi"
          [style.--kpi-accent]="tile.accent"
          [style.--kpi-tint]="tile.tint"
        >
          <div class="kpi-badge">
            <i class="pi" [class]="tile.icon" aria-hidden="true"></i>
          </div>
          <div class="lbl">{{ tile.label }}</div>
          <div class="num">{{ kpis()[tile.key] }}</div>
          <div class="sub">{{ subText(tile) }}</div>
        </article>
      }
    </div>
  `,
  styleUrl: './kpi-cards.component.scss',
})
export class KpiCardsComponent {
  readonly kpis = input.required<Kpis>();

  protected readonly tiles: KpiTile[] = [
    {
      key: 'total',
      label: 'Total Projects',
      sub: 'in scope',
      accent: '#334155',
      tint: '#f1f5f9',
      icon: 'pi-briefcase',
    },
    {
      key: 'active',
      label: 'Active',
      sub: 'in progress / testing',
      accent: '#2563EB',
      tint: '#eff6ff',
      icon: 'pi-bolt',
    },
    {
      key: 'done',
      label: 'Completed',
      sub: 'done / handed over',
      accent: '#059669',
      tint: '#ecfdf5',
      icon: 'pi-check-circle',
    },
    {
      key: 'hold',
      label: 'On Hold',
      sub: 'awaiting action',
      accent: '#D97706',
      tint: '#fffbeb',
      icon: 'pi-pause-circle',
    },
    {
      key: 'delayed',
      label: 'Delayed',
      sub: 'past target date',
      accent: '#DC2626',
      tint: '#fef2f2',
      icon: 'pi-exclamation-triangle',
    },
    {
      key: 'notFilled',
      label: 'Not Filled',
      sub: 'no updates this week',
      accent: '#7C3AED',
      tint: '#f5f3ff',
      icon: 'pi-file-edit',
    },
  ];

  protected subText(tile: KpiTile): string {
    const total = this.kpis().total || 1;
    if (tile.key === 'total') return tile.sub;
    const pct = Math.round((this.kpis()[tile.key] / total) * 100);
    return `${pct}% · ${tile.sub}`;
  }
}

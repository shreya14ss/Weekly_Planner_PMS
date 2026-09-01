import { ChangeDetectionStrategy, Component, input } from '@angular/core';

import { Kpis } from '@features/dashboard/dashboard-aggregations';

interface KpiTile {
  key: keyof Kpis;
  label: string;
  sub: string;
  accent: string; // border-top colour
  numClass: string; // Tailwind class for number colour
}

/**
 * Six primary KPI tiles. Pure presentation — the parent supplies the
 * Kpis snapshot as an input.
 */
@Component({
  selector: 'app-kpi-cards',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
      @for (tile of tiles; track tile.key) {
        <article class="kpi" [style.borderTopColor]="tile.accent">
          <div class="lbl">{{ tile.label }}</div>
          <div class="num" [class]="tile.numClass">{{ kpis()[tile.key] }}</div>
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
      accent: '#6B7280',
      numClass: 'text-slate-700',
    },
    {
      key: 'active',
      label: 'Active',
      sub: 'in progress / testing',
      accent: '#2563EB',
      numClass: 'text-blue-700',
    },
    {
      key: 'done',
      label: 'Completed',
      sub: 'done / handed over',
      accent: '#059669',
      numClass: 'text-emerald-700',
    },
    {
      key: 'hold',
      label: 'On Hold',
      sub: 'awaiting action',
      accent: '#D97706',
      numClass: 'text-amber-700',
    },
    {
      key: 'delayed',
      label: 'Delayed',
      sub: 'past target date',
      accent: '#DC2626',
      numClass: 'text-rose-700',
    },
    {
      key: 'notFilled',
      label: 'Not Filled',
      sub: 'no updates this week',
      accent: '#7C3AED',
      numClass: 'text-violet-700',
    },
  ];

  protected subText(tile: KpiTile): string {
    const total = this.kpis().total || 1;
    if (tile.key === 'total') return tile.sub;
    const pct = Math.round((this.kpis()[tile.key] / total) * 100);
    return `${pct}% · ${tile.sub}`;
  }
}

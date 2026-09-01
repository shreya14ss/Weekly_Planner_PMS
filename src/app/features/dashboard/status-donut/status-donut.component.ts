import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

import { StatusSegment } from '@features/dashboard/dashboard-aggregations';

interface ArcSegment {
  status: string;
  count: number;
  color: string;
  path: string;
  percent: number;
}

const CX = 80;
const CY = 80;
const R = 60;
const INNER = 38;

/**
 * Hand-rolled SVG donut chart. Chose SVG over Chart.js to avoid the
 * ~200KB dependency for what is functionally a one-off pie. Segments
 * are computed once via `computed` and re-rendered whenever the input
 * changes.
 */
@Component({
  selector: 'app-status-donut',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="wrap">
      <div class="donut-ring" role="img" aria-label="Status distribution donut">
        <svg viewBox="0 0 160 160" width="160" height="160">
          @for (arc of arcs(); track arc.status) {
            <path [attr.d]="arc.path" [attr.fill]="arc.color" />
          }
          <circle cx="80" cy="80" [attr.r]="inner" fill="#ffffff" />
        </svg>
        <div class="center">
          <div class="total">{{ total() }}</div>
          <div class="lbl">Projects</div>
        </div>
      </div>

      <div class="legend">
        @for (arc of arcs(); track arc.status) {
          <div class="legend-item">
            <span class="dot" [style.background]="arc.color"></span>
            <span class="label">{{ arc.status }}</span>
            <span class="count">{{ arc.count }}</span>
            <span class="pct">({{ arc.percent }}%)</span>
          </div>
        }
        @if (arcs().length === 0) {
          <div class="text-slate-400 text-sm py-4 text-center">
            No projects in the current scope.
          </div>
        }
      </div>
    </div>
  `,
  styleUrl: './status-donut.component.scss',
})
export class StatusDonutComponent {
  readonly segments = input.required<StatusSegment[]>();

  protected readonly inner = INNER;

  protected readonly total = computed(() =>
    this.segments().reduce((acc, s) => acc + s.count, 0),
  );

  protected readonly arcs = computed<ArcSegment[]>(() => {
    const segs = this.segments();
    const total = this.total();
    if (total === 0) return [];

    // Single 100% slice needs a full-circle path that the two-arc
    // formula can't express. Handle it separately.
    if (segs.length === 1) {
      return [
        {
          ...segs[0],
          percent: 100,
          path: fullCirclePath(CX, CY, R),
        },
      ];
    }

    let start = -Math.PI / 2; // 12 o'clock
    return segs.map((s) => {
      const frac = s.count / total;
      const end = start + frac * 2 * Math.PI;
      const path = arcPath(CX, CY, R, start, end);
      const arc: ArcSegment = {
        status: s.status || 'Not Set',
        count: s.count,
        color: s.color,
        path,
        percent: Math.round(frac * 100),
      };
      start = end;
      return arc;
    });
  });
}

function arcPath(cx: number, cy: number, r: number, start: number, end: number): string {
  const x1 = cx + r * Math.cos(start);
  const y1 = cy + r * Math.sin(start);
  const x2 = cx + r * Math.cos(end);
  const y2 = cy + r * Math.sin(end);
  const largeArc = end - start > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
}

function fullCirclePath(cx: number, cy: number, r: number): string {
  return `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z`;
}

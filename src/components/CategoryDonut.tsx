import React, { useState } from 'react';
import { CategorySlice } from '../types';

// Map the Tailwind tint keys used by topics to solid hex values for SVG marks.
// The 500 shade reads well on both light and dark chart surfaces.
const TINT_HEX: Record<string, string> = {
  emerald: '#10b981',
  cyan: '#06b6d4',
  amber: '#f59e0b',
  orange: '#f97316',
  blue: '#3b82f6',
  purple: '#a855f7',
  pink: '#ec4899',
  slate: '#64748b',
};

const colorFor = (tint: string) => TINT_HEX[tint] ?? TINT_HEX.slate;

interface CategoryDonutProps {
  slices: CategorySlice[];
  total: number;
  formatCurrency: (amount: number, forceNoDecimals?: boolean) => string;
}

const SIZE = 176;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Visual gap between adjacent segments, expressed along the arc.
const GAP = 3;

const CategoryDonut: React.FC<CategoryDonutProps> = ({
  slices,
  total,
  formatCurrency,
}) => {
  const [active, setActive] = useState<number | null>(null);

  if (slices.length === 0 || total <= 0) {
    return (
      <div className="rounded-2xl border border-border bg-card/50 p-6 text-center">
        <p className="text-sm text-muted-foreground">
          Sin gastos para mostrar en este período.
        </p>
      </div>
    );
  }

  // Precompute each segment's dash geometry. The offset for a segment is the
  // arc length of all preceding segments (computed without mutable state).
  const segments = slices.map((slice, i) => {
    const priorTotal = slices.slice(0, i).reduce((sum, s) => sum + s.total, 0);
    const arc = (slice.total / total) * CIRCUMFERENCE;
    const dash = Math.max(arc - GAP, 0.0001);
    return {
      slice,
      index: i,
      dashArray: `${dash} ${CIRCUMFERENCE - dash}`,
      dashOffset: -(priorTotal / total) * CIRCUMFERENCE,
    };
  });

  const highlighted = active !== null ? slices[active] : null;

  return (
    <div className="rounded-2xl border border-border bg-card/50 p-5">
      <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center sm:justify-between">
        {/* Donut */}
        <div
          className="relative shrink-0"
          style={{ width: SIZE, height: SIZE }}
        >
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            role="img"
            aria-label="Distribución de gastos por categoría"
          >
            <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
              {segments.map((seg) => {
                const isActive = active === seg.index;
                const isDimmed = active !== null && !isActive;
                return (
                  <circle
                    key={seg.slice.topicId}
                    cx={SIZE / 2}
                    cy={SIZE / 2}
                    r={RADIUS}
                    fill="none"
                    stroke={colorFor(seg.slice.color)}
                    strokeWidth={isActive ? STROKE + 4 : STROKE}
                    strokeDasharray={seg.dashArray}
                    strokeDashoffset={seg.dashOffset}
                    strokeLinecap="butt"
                    opacity={isDimmed ? 0.35 : 1}
                    style={{ transition: 'opacity 150ms, stroke-width 150ms' }}
                    onMouseEnter={() => setActive(seg.index)}
                    onMouseLeave={() => setActive(null)}
                  >
                    <title>
                      {seg.slice.name}: {formatCurrency(seg.slice.total)} (
                      {seg.slice.percent.toFixed(1)}%)
                    </title>
                  </circle>
                );
              })}
            </g>
          </svg>
          {/* Center label: total, or the hovered category. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] uppercase tracking-widest text-muted-foreground">
              {highlighted ? highlighted.name : 'Total'}
            </span>
            <span className="font-mono text-lg font-semibold text-foreground">
              {formatCurrency(highlighted ? highlighted.total : total)}
            </span>
            {highlighted && (
              <span className="text-xs text-muted-foreground">
                {highlighted.percent.toFixed(1)}%
              </span>
            )}
          </div>
        </div>

        {/* Legend — carries identity so category is never color-alone. */}
        <ul className="w-full max-w-xs space-y-1.5">
          {slices.map((slice, i) => {
            const isActive = active === i;
            return (
              <li key={slice.topicId}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    isActive ? 'bg-muted/60' : 'hover:bg-muted/40'
                  }`}
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: colorFor(slice.color) }}
                    aria-hidden="true"
                  />
                  <span className="flex-1 truncate text-sm text-foreground">
                    {slice.name}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {slice.percent.toFixed(0)}%
                  </span>
                  <span className="w-20 text-right font-mono text-sm text-foreground">
                    {formatCurrency(slice.total)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
};

export default CategoryDonut;

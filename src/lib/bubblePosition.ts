// Where the floating assistant bubble can sit, and how a drag becomes a saved position.
// Pure functions: the bubble snaps to the left or right edge and remembers its height as a
// ratio of the allowed band, so it keeps a sensible place when the screen rotates or resizes.
export const BUBBLE_SIZE = 56;
export const EDGE_MARGIN = 12;
const KEY_STEP = 48;
const DESKTOP_MIN_WIDTH = 768;

export type Side = 'left' | 'right';
export interface Viewport {
  width: number;
  height: number;
}
export interface BubblePosition {
  side: Side;
  /** 0 = top of the allowed band, 1 = bottom. */
  yRatio: number;
}

export const DEFAULT_POSITION: BubblePosition = { side: 'right', yRatio: 1 };

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** On a phone the bubble stays under the sticky header and above the bottom bar. */
export function allowedY(viewport: Viewport): { min: number; max: number } {
  const desktop = viewport.width >= DESKTOP_MIN_WIDTH;
  const top = desktop ? 24 : 72;
  const bottom = desktop ? 24 : 100;
  const min = top;
  return { min, max: Math.max(min, viewport.height - bottom - BUBBLE_SIZE) };
}

const xFor = (side: Side, viewport: Viewport) =>
  side === 'left' ? EDGE_MARGIN : viewport.width - BUBBLE_SIZE - EDGE_MARGIN;

export function toPixels(
  position: BubblePosition,
  viewport: Viewport
): { x: number; y: number } {
  const { min, max } = allowedY(viewport);
  return {
    x: xFor(position.side, viewport),
    y: Math.round(min + position.yRatio * (max - min)),
  };
}

export function clampPixels(
  point: { x: number; y: number },
  viewport: Viewport
): { x: number; y: number } {
  const { min, max } = allowedY(viewport);
  return {
    x: clamp(
      point.x,
      EDGE_MARGIN,
      Math.max(EDGE_MARGIN, viewport.width - BUBBLE_SIZE - EDGE_MARGIN)
    ),
    y: clamp(point.y, min, max),
  };
}

/** Where a released drag lands: the nearer side, at the height it was dropped. */
export function dropTo(
  point: { x: number; y: number },
  viewport: Viewport
): BubblePosition {
  const { min, max } = allowedY(viewport);
  const center = point.x + BUBBLE_SIZE / 2;
  const yRatio = max === min ? 0 : clamp((point.y - min) / (max - min), 0, 1);
  return { side: center < viewport.width / 2 ? 'left' : 'right', yRatio };
}

export function nudge(
  position: BubblePosition,
  key: string,
  viewport: Viewport
): BubblePosition {
  if (key === 'ArrowLeft') return { ...position, side: 'left' };
  if (key === 'ArrowRight') return { ...position, side: 'right' };
  const { min, max } = allowedY(viewport);
  const step = max === min ? 0 : KEY_STEP / (max - min);
  if (key === 'ArrowUp')
    return { ...position, yRatio: clamp(position.yRatio - step, 0, 1) };
  if (key === 'ArrowDown')
    return { ...position, yRatio: clamp(position.yRatio + step, 0, 1) };
  return position;
}

export function serialize(position: BubblePosition): string {
  return JSON.stringify(position);
}

export function parseStored(raw: string | null): BubblePosition | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<BubblePosition> | null;
    if (!value || (value.side !== 'left' && value.side !== 'right'))
      return null;
    if (typeof value.yRatio !== 'number' || !Number.isFinite(value.yRatio))
      return null;
    if (value.yRatio < 0 || value.yRatio > 1) return null;
    return { side: value.side, yRatio: value.yRatio };
  } catch {
    return null;
  }
}

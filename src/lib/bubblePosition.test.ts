import { describe, expect, it } from 'vitest';
import {
  BUBBLE_SIZE,
  DEFAULT_POSITION,
  EDGE_MARGIN,
  allowedY,
  clampPixels,
  dropTo,
  nudge,
  parseStored,
  serialize,
  toPixels,
} from './bubblePosition';

const phone = { width: 390, height: 844 };
const desktop = { width: 1440, height: 900 };

describe('allowedY', () => {
  it('keeps the bubble under the header and above the bottom bar on a phone', () => {
    expect(allowedY(phone)).toEqual({ min: 72, max: 844 - 100 - BUBBLE_SIZE });
  });

  it('uses small margins on a desktop screen', () => {
    expect(allowedY(desktop)).toEqual({ min: 24, max: 900 - 24 - BUBBLE_SIZE });
  });

  it('never returns an empty band on a tiny screen', () => {
    const { min, max } = allowedY({ width: 320, height: 120 });
    expect(max).toBeGreaterThanOrEqual(min);
  });
});

describe('toPixels', () => {
  it('puts the bubble against the chosen side at the chosen height', () => {
    const { min, max } = allowedY(phone);
    expect(toPixels({ side: 'right', yRatio: 1 }, phone)).toEqual({
      x: 390 - BUBBLE_SIZE - EDGE_MARGIN,
      y: max,
    });
    expect(toPixels({ side: 'left', yRatio: 0 }, phone)).toEqual({
      x: EDGE_MARGIN,
      y: min,
    });
    expect(toPixels({ side: 'left', yRatio: 0.5 }, phone).y).toBe(
      Math.round((min + max) / 2)
    );
  });

  it('starts at the bottom right', () => {
    expect(DEFAULT_POSITION).toEqual({ side: 'right', yRatio: 1 });
  });
});

describe('clampPixels', () => {
  it('keeps a dragged bubble inside the screen and inside the allowed band', () => {
    const { min, max } = allowedY(phone);
    expect(clampPixels({ x: -50, y: -50 }, phone)).toEqual({
      x: EDGE_MARGIN,
      y: min,
    });
    expect(clampPixels({ x: 9999, y: 9999 }, phone)).toEqual({
      x: 390 - BUBBLE_SIZE - EDGE_MARGIN,
      y: max,
    });
    expect(clampPixels({ x: 100, y: 300 }, phone)).toEqual({ x: 100, y: 300 });
  });
});

describe('dropTo', () => {
  it('snaps to the nearer side and remembers the height as a ratio', () => {
    const { min, max } = allowedY(phone);
    expect(dropTo({ x: 40, y: min }, phone)).toEqual({
      side: 'left',
      yRatio: 0,
    });
    expect(dropTo({ x: 300, y: max }, phone)).toEqual({
      side: 'right',
      yRatio: 1,
    });
    expect(dropTo({ x: 160, y: 400 }, phone).side).toBe('left');
    expect(dropTo({ x: 200, y: 400 }, phone).side).toBe('right');
  });

  it('keeps the ratio between 0 and 1 even when dropped outside the band', () => {
    expect(dropTo({ x: 10, y: -500 }, phone).yRatio).toBe(0);
    expect(dropTo({ x: 10, y: 5000 }, phone).yRatio).toBe(1);
  });
});

describe('nudge (keyboard)', () => {
  it('moves to the other side with left and right', () => {
    expect(nudge({ side: 'right', yRatio: 0.5 }, 'ArrowLeft', phone)).toEqual({
      side: 'left',
      yRatio: 0.5,
    });
    expect(nudge({ side: 'left', yRatio: 0.5 }, 'ArrowRight', phone)).toEqual({
      side: 'right',
      yRatio: 0.5,
    });
  });

  it('moves up and down in steps and stops at the ends', () => {
    const up = nudge({ side: 'right', yRatio: 0.5 }, 'ArrowUp', phone);
    const down = nudge({ side: 'right', yRatio: 0.5 }, 'ArrowDown', phone);
    expect(up.yRatio).toBeLessThan(0.5);
    expect(down.yRatio).toBeGreaterThan(0.5);
    expect(nudge({ side: 'right', yRatio: 0 }, 'ArrowUp', phone).yRatio).toBe(
      0
    );
    expect(nudge({ side: 'right', yRatio: 1 }, 'ArrowDown', phone).yRatio).toBe(
      1
    );
  });
});

describe('saved position', () => {
  it('round-trips a valid position', () => {
    const pos = { side: 'left' as const, yRatio: 0.25 };
    expect(parseStored(serialize(pos))).toEqual(pos);
  });

  it('ignores anything that is not a valid position', () => {
    for (const raw of [
      null,
      '',
      'nope',
      '{}',
      '{"side":"top","yRatio":0.5}',
      '{"side":"left","yRatio":2}',
      '{"side":"left","yRatio":-1}',
      '{"side":"left","yRatio":"x"}',
      '{"side":"left","yRatio":null}',
      '[]',
    ]) {
      expect(parseStored(raw)).toBeNull();
    }
  });
});

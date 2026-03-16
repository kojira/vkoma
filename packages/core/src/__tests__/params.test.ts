import { describe, it, expect } from 'vitest';
import { sceneParams, applyEasing } from '../params';
import type { EasingType } from '../params';

const ALL_EASING_TYPES: EasingType[] = [
  'linear', 'easeIn', 'easeOut', 'easeInOut',
  'easeInQuad', 'easeOutQuad', 'easeInOutQuad',
  'easeInCubic', 'easeOutCubic', 'easeInOutCubic',
  'easeOutBounce', 'easeOutElastic', 'easeOutBack',
];

describe('sceneParams', () => {
  it('boolean() returns correct object', () => {
    const p = sceneParams.boolean('Enable', true);
    expect(p.type).toBe('boolean');
    expect(p.label).toBe('Enable');
    expect(p.default).toBe(true);
  });

  it('font() returns correct object', () => {
    const p = sceneParams.font('Font', 'Helvetica');
    expect(p.type).toBe('font');
    expect(p.default).toBe('Helvetica');
  });

  it('easing() returns correct object', () => {
    const p = sceneParams.easing('Easing', 'easeOut');
    expect(p.type).toBe('easing');
    expect(p.default).toBe('easeOut');
  });

  it('position() returns {x, y} as default', () => {
    const p = sceneParams.position('Position', 100, 200);
    expect(p.type).toBe('position');
    expect(p.default).toEqual({ x: 100, y: 200 });
  });

  it('image() returns empty string default', () => {
    const p = sceneParams.image('Image');
    expect(p.type).toBe('image');
    expect(p.default).toBe('');
  });

  it('audio() returns empty string default', () => {
    const p = sceneParams.audio('Audio');
    expect(p.type).toBe('audio');
    expect(p.default).toBe('');
  });

  it('select() with string array converts to SelectOption[]', () => {
    const p = sceneParams.select('Effect', 'fade', ['none', 'fade', 'zoom']);
    expect(p.options).toHaveLength(3);
    expect(p.options![0]).toEqual({ value: 'none', label: 'none' });
  });

  it('select() with SelectOption array keeps labels', () => {
    const p = sceneParams.select('Effect', 'fade', [
      { value: 'fade', label: 'フェード' },
      { value: 'zoom', label: 'ズーム' },
    ]);
    expect(p.options![0].label).toBe('フェード');
  });
});

describe('applyEasing', () => {
  it('all EasingType values produce 0 at t=0 and 1 at t=1', () => {
    for (const easing of ALL_EASING_TYPES) {
      expect(applyEasing(0, easing)).toBeCloseTo(0, 5);
      expect(applyEasing(1, easing)).toBeCloseTo(1, 3);
    }
  });

  it('linear returns t', () => {
    expect(applyEasing(0.5, 'linear')).toBeCloseTo(0.5);
  });

  it('easeIn starts slow', () => {
    expect(applyEasing(0.1, 'easeIn')).toBeLessThan(0.1);
  });

  it('easeOut starts fast', () => {
    expect(applyEasing(0.9, 'easeOut')).toBeGreaterThan(0.9);
  });

  it('clamps input outside 0-1', () => {
    expect(applyEasing(-1, 'linear')).toBeCloseTo(0);
    expect(applyEasing(2, 'linear')).toBeCloseTo(1);
  });
});

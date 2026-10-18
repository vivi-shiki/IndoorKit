import { describe, expect, it } from 'vitest';
import { ResourceTracker } from '../src/index';

describe('ResourceTracker', () => {
  it('returns the tracked value and counts it', () => {
    const tracker = new ResourceTracker();
    const value = tracker.track({ id: 1 }, () => {});
    expect(value).toEqual({ id: 1 });
    expect(tracker.size).toBe(1);
  });

  it('disposes in reverse order of creation', () => {
    const tracker = new ResourceTracker();
    const order: string[] = [];
    tracker.track('a', (v) => order.push(v));
    tracker.track('b', (v) => order.push(v));
    tracker.track('c', (v) => order.push(v));
    tracker.disposeAll();
    expect(order).toEqual(['c', 'b', 'a']);
    expect(tracker.size).toBe(0);
  });

  it('keeps disposing after a disposer throws and reports the error', () => {
    const tracker = new ResourceTracker();
    const order: string[] = [];
    tracker.track('a', (v) => order.push(v));
    tracker.track('bad', () => {
      throw new Error('boom');
    });
    tracker.track('c', (v) => order.push(v));
    const errors = tracker.disposeAll();
    expect(order).toEqual(['c', 'a']);
    expect(errors).toHaveLength(1);
    expect(errors[0]!.message).toBe('boom');
  });

  it('is idempotent', () => {
    const tracker = new ResourceTracker();
    let calls = 0;
    tracker.track(1, () => {
      calls++;
    });
    tracker.disposeAll();
    tracker.disposeAll();
    expect(calls).toBe(1);
  });

  it('lists labels of live resources', () => {
    const tracker = new ResourceTracker();
    tracker.track(1, () => {}, 'layer:a');
    tracker.track(2, () => {}, 'source:b');
    expect(tracker.labels()).toEqual(['layer:a', 'source:b']);
  });
});

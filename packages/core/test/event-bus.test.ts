import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../src/index';

type Events = { ping: { n: number }; pong: undefined };

describe('EventBus', () => {
  it('delivers events to every handler', () => {
    const bus = new EventBus<Events>();
    const a = vi.fn();
    const b = vi.fn();
    bus.on('ping', a);
    bus.on('ping', b);
    bus.emit('ping', { n: 1 });
    expect(a).toHaveBeenCalledWith({ n: 1 });
    expect(b).toHaveBeenCalledWith({ n: 1 });
  });

  it('stops delivering after the returned unsubscribe is called', () => {
    const bus = new EventBus<Events>();
    const a = vi.fn();
    const off = bus.on('ping', a);
    off();
    bus.emit('ping', { n: 2 });
    expect(a).not.toHaveBeenCalled();
  });

  it('counts handlers and clears them all', () => {
    const bus = new EventBus<Events>();
    bus.on('ping', () => {});
    bus.on('pong', () => {});
    expect(bus.listenerCount()).toBe(2);
    bus.clear();
    expect(bus.listenerCount()).toBe(0);
  });
});

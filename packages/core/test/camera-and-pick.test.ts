import { buildVenueModel } from '@indoorkit/imdf';
import { describe, expect, it } from 'vitest';
import { makeArchive } from '../../imdf/test/fixture';
import { createIndoorMap, definePlugin } from '../src/index';
import { type FakeMap, fakeMapFactory } from '../src/testing';

const venue = buildVenueModel(makeArchive());

async function open(options: Partial<Parameters<typeof createIndoorMap>[0]> = {}) {
  let fake!: FakeMap;
  let style: unknown;
  const map = await createIndoorMap({
    container: 'map',
    venue,
    mapFactory: fakeMapFactory((m, o) => {
      fake = m;
      style = o.style;
    }),
    ...options,
  });
  return { map, fake, style: style as { glyphs: string } };
}

describe('camera', () => {
  it('focuses on a coordinate and fits bounds without touching pitch or bearing', async () => {
    const { map, fake } = await open();
    map.camera.focus([0.001, 0.0005], { durationMs: 300 });
    map.camera.fit(venue.bounds, { padding: { top: 10, bottom: 20, left: 30, right: 40 }, durationMs: 0 });
    expect(fake.cameraCalls).toEqual([
      { method: 'easeTo', options: { center: [0.001, 0.0005], duration: 300 } },
      {
        method: 'fitBounds',
        bounds: venue.bounds,
        options: {
          padding: { top: 10, bottom: 20, left: 30, right: 40 },
          pitch: 45,
          bearing: 0,
          duration: 0,
        },
      },
    ]);
  });

  it('defaults the animation to 500 ms', async () => {
    const { map, fake } = await open();
    map.camera.focus([0, 0]);
    expect(fake.cameraCalls[0]).toEqual({ method: 'easeTo', options: { center: [0, 0], duration: 500 } });
  });

  it('projects a coordinate to container pixels', async () => {
    const { map } = await open();
    expect(map.project([0.001, 0.0005])).toEqual({ x: 100, y: -50 });
  });
});

describe('map:click', () => {
  it('reports the clicked pixel and coordinate', async () => {
    const { map, fake } = await open();
    const clicks: unknown[] = [];
    map.events.on('map:click', (e) => clicks.push(e));
    fake.fire('click', { type: 'click', point: { x: 5, y: 6 }, lngLat: { lng: 0.1, lat: 0.2 } });
    expect(clicks).toEqual([{ point: { x: 5, y: 6 }, coord: [0.1, 0.2] }]);
  });

  it('stops listening after destroy', async () => {
    const { map, fake } = await open();
    await map.destroy();
    expect(fake.listenerCount('click')).toBe(0);
  });
});

describe('idle and render', () => {
  it('resolves idle() after the map next goes idle, asking it to repaint', async () => {
    const { map, fake } = await open();
    let done = false;
    const idle = map.idle().then(() => {
      done = true;
    });
    expect(fake.repaints).toBe(1);
    await Promise.resolve();
    expect(done).toBe(false);
    fake.fire('idle');
    await idle;
    expect(done).toBe(true);
  });

  it('resolves rendered() on the next frame drawn', async () => {
    const { map, fake } = await open();
    const rendered = map.rendered();
    fake.fire('render');
    await expect(rendered).resolves.toBeUndefined();
  });
});

describe('plugin lookup', () => {
  it('returns a loaded plugin by name and throws for a missing one', async () => {
    const probe = definePlugin({ name: 'probe', setup: () => ({ hello: () => 'hi' }) });
    const { map } = await open({ plugins: [probe] });
    expect(map.plugin<{ hello(): string }>('probe').hello()).toBe('hi');
    expect(map.hasPlugin('probe')).toBe(true);
    expect(map.hasPlugin('nope')).toBe(false);
    expect(() => map.plugin('nope')).toThrow(/plugin "nope" is not loaded/);
  });
});

describe('options', () => {
  it('uses the glyphs url it is given', async () => {
    const { style } = await open({ glyphs: 'https://example.test/{fontstack}/{range}.pbf' });
    expect(style.glyphs).toBe('https://example.test/{fontstack}/{range}.pbf');
  });
});

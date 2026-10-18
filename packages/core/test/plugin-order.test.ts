import { describe, expect, it } from 'vitest';
import { definePlugin, sortPlugins } from '../src/index';

const p = (name: string, deps: string[] = []) => definePlugin({ name, deps, setup: () => ({}) });

describe('sortPlugins', () => {
  it('puts dependencies before dependents regardless of input order', () => {
    const sorted = sortPlugins([p('marker', ['floor']), p('floor'), p('popup', ['marker'])]);
    expect(sorted.map((x) => x.name)).toEqual(['floor', 'marker', 'popup']);
  });

  it('throws on a missing dependency', () => {
    expect(() => sortPlugins([p('marker', ['floor'])])).toThrow(/missing dependency.*floor/);
  });

  it('throws on a dependency cycle', () => {
    expect(() => sortPlugins([p('a', ['b']), p('b', ['a'])])).toThrow(/cycle/);
  });

  it('throws on duplicate plugin names', () => {
    expect(() => sortPlugins([p('a'), p('a')])).toThrow(/duplicate plugin/);
  });
});

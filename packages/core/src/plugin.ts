import type { AnyPlugin, PluginDef } from './types';

export function definePlugin<N extends string, A>(def: PluginDef<N, A>): PluginDef<N, A> {
  return def;
}

/** 按依赖做拓扑排序；缺依赖、循环依赖、重名都会抛错 */
export function sortPlugins<P extends AnyPlugin>(plugins: readonly P[]): P[] {
  const byName = new Map<string, P>();
  for (const p of plugins) {
    if (byName.has(p.name)) throw new Error(`duplicate plugin "${p.name}"`);
    byName.set(p.name, p);
  }
  const sorted: P[] = [];
  const state = new Map<string, 'visiting' | 'done'>();
  const visit = (p: P, path: string[]) => {
    const s = state.get(p.name);
    if (s === 'done') return;
    if (s === 'visiting') throw new Error(`plugin dependency cycle: ${[...path, p.name].join(' -> ')}`);
    state.set(p.name, 'visiting');
    for (const dep of p.deps ?? []) {
      const d = byName.get(dep);
      if (!d) throw new Error(`plugin "${p.name}" has a missing dependency "${dep}"`);
      visit(d, [...path, p.name]);
    }
    state.set(p.name, 'done');
    sorted.push(p);
  };
  for (const p of plugins) visit(p, []);
  return sorted;
}

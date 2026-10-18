import { definePlugin, levelFilter } from '@indoorkit/core';
import type { LevelModel } from '@indoorkit/imdf';

export interface FloorApi {
  list(): readonly LevelModel[];
  current(): LevelModel;
  /** 楼层 id 或简称（如 "2F"） */
  resolve(ref: string): LevelModel;
  set(ref: string): void;
}

export const floorPlugin = definePlugin({
  name: 'floor',
  setup(ctx): FloorApi {
    const levels = ctx.venue.levels;
    if (levels.length === 0) throw new Error('venue has no levels');
    let current = levels.find((l) => l.ordinal === 0) ?? levels[0]!;

    const apply = () => {
      for (const id of ctx.indoorLayerIds) ctx.map.setFilter(id, levelFilter(current.id));
    };
    const resolve = (ref: string) => {
      const level = levels.find((l) => l.id === ref || Object.values(l.shortName).includes(ref));
      if (!level) throw new Error(`unknown floor "${ref}"`);
      return level;
    };

    apply();
    return {
      list: () => levels,
      current: () => current,
      resolve,
      set(ref) {
        const next = resolve(ref);
        if (next.id === current.id) return;
        const previous = current.id;
        current = next;
        apply();
        ctx.events.emit('floor:change', { levelId: next.id, previous });
      },
    };
  },
});

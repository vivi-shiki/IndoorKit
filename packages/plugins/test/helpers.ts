import { type AnyPlugin, createIndoorMap, type PositionBatch, type TagPosition } from '@indoorkit/core';
import { type FakeMap, fakeMapFactory } from '@indoorkit/core/testing';
import { buildVenueModel } from '@indoorkit/imdf';
import { IDS, makeArchive } from '../../imdf/test/fixture';

export { IDS };

/** 用 FakeMap 打开测试地图；楼层 1F = IDS.level1，2F = IDS.level2 */
export async function openMap<const P extends readonly AnyPlugin[]>(plugins: P) {
  let fake!: FakeMap;
  const map = await createIndoorMap({
    container: 'map',
    venue: buildVenueModel(makeArchive()),
    mapFactory: fakeMapFactory((m) => {
      fake = m;
    }),
    plugins,
  });
  return { map, fake };
}

export const tag = (id: string, levelId: string, coord: [number, number]): TagPosition => ({ id, levelId, coord });
export const batch = (time: number, positions: TagPosition[]): PositionBatch => ({ time, positions });

export const featureCollection = (fake: FakeMap, sourceId: string) =>
  fake.getSourceData(sourceId) as GeoJSON.FeatureCollection;

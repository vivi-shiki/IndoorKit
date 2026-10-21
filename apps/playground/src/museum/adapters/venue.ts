import { buildVenueModel, fetchImdf, type VenueModel } from '@indoorkit/imdf';
import { createMuseum, type Museum, museumExtensions } from '@indoorkit/museum';
import { createMuseumDay, type MuseumDay } from '@indoorkit/museum-simulator';
import { type AlarmStore, createAlarmStore } from './alarms';
import { createSimClock, DEFAULT_START, type SimClock } from './clock';

/** 博物馆演示的数据：场馆、业务、模拟的一天、时钟和告警；换页后保留 */
export interface MuseumContext {
  venue: VenueModel;
  museum: Museum;
  day: MuseumDay;
  alarms: AlarmStore;
  clock: SimClock;
}

/** 同一个种子，同一位来馆者每次走同样的路线 */
export const MUSEUM_SEED = 'minato-museum';

let cached: Promise<MuseumContext> | undefined;

/** 虚构的みなと市立美術博物館由 tools/venue-gen 在构建时生成；展示柜、藏品、设备和路线在 IMDF 之外的扩展文件里 */
export function loadMuseum(): Promise<MuseumContext> {
  cached ??= fetchImdf(`${import.meta.env.BASE_URL}data/minato-museum`, fetch, museumExtensions).then(
    (archive) => {
      const venue = buildVenueModel(archive, museumExtensions);
      const museum = createMuseum(venue);
      const day = createMuseumDay(museum, { seed: MUSEUM_SEED });
      return {
        venue,
        museum,
        day,
        alarms: createAlarmStore(museum, day),
        clock: createSimClock({ start: DEFAULT_START }),
      };
    },
  );
  // 失败的请求不缓存，重试时重新下载
  cached.catch(() => {
    cached = undefined;
  });
  return cached;
}

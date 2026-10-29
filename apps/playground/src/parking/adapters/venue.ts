import { buildVenueModel, fetchImdf, type VenueModel } from '@indoorkit/imdf';
import {
  type Bookings,
  createBookings,
  createParking,
  createRouter,
  type ParkedVehicle,
  type Parking,
  parkingExtensions,
  type Router,
} from '@indoorkit/parking';
import { createParkingDay, type ParkingDay } from '@indoorkit/parking-simulator';
import { type AlarmStore, createAlarmStore } from './alarms';
import { createSimClock, DEFAULT_START, type SimClock } from './clock';
import { alertBays, type BayState, bayStates, detectorsDown, freeByLevel, reservedBays } from './live';

/** 停车场演示的数据：场馆、业务、模拟的一天、时钟、告警和预约；换页后保留 */
export interface ParkingContext {
  venue: VenueModel;
  parking: Parking;
  day: ParkingDay;
  router: Router;
  bookings: Bookings;
  alarms: AlarmStore;
  clock: SimClock;
}

/** 同一个种子，同一个车牌就是同一辆车 */
export const PARKING_SEED = 'minato';

let cached: Promise<ParkingContext> | undefined;

/** 虚构的港中央停车场由 tools/venue-gen 在构建时生成；区、设备和车道在 IMDF 之外的扩展文件里 */
export function loadParking(): Promise<ParkingContext> {
  cached ??= fetchImdf(`${import.meta.env.BASE_URL}data/minato-parking`, fetch, parkingExtensions).then(
    (archive) => {
      const venue = buildVenueModel(archive, parkingExtensions);
      const parking = createParking(venue);
      const day = createParkingDay(parking, { seed: PARKING_SEED });
      return {
        venue,
        parking,
        day,
        router: createRouter(parking),
        bookings: createBookings(parking),
        alarms: createAlarmStore(parking, day),
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

/** 某一时刻的场内状态：停着的车、每个车位的状态和每层的空闲数 */
export interface LiveSnapshot {
  time: number;
  parked: readonly ParkedVehicle[];
  parkedByBay: ReadonlyMap<string, ParkedVehicle>;
  states: ReadonlyMap<string, BayState>;
  freeByLevel: ReadonlyMap<string, number>;
}

export function liveAt(
  ctx: Pick<ParkingContext, 'parking' | 'day' | 'alarms' | 'bookings'>,
  t: number,
): LiveSnapshot {
  ctx.alarms.update(t);
  const parked = ctx.day.parkedAt(t);
  const states = bayStates({
    parking: ctx.parking,
    parked,
    detectorsDown: detectorsDown(ctx.parking, ctx.day.deviceReadings(t)),
    reserved: reservedBays(ctx.parking, ctx.day.reservations, ctx.bookings, t),
    alerts: alertBays(ctx.alarms, parked),
  });
  return {
    time: t,
    parked,
    parkedByBay: new Map(parked.map((p) => [p.bayId, p])),
    states,
    freeByLevel: freeByLevel(ctx.parking, states),
  };
}

import type { Bay, Parking, VehicleClass } from './model';
import { createRouter } from './routing';

/** 预约按 15 分钟一格 */
export const SLOT_MS = 15 * 60_000;
/** 开始时间在这之内的预约，车位此刻必须是空的 */
const SOON_MS = 30 * 60_000;

export interface SlotRequest {
  from: number;
  to: number;
  vehicle: VehicleClass;
  /** 需要无障碍车位 */
  accessible?: boolean;
  /** 按到电梯、楼梯的步行距离排序 */
  nearExit?: boolean;
}

export interface Reservation {
  id: string;
  bayId: string;
  from: number;
  to: number;
  plate?: string;
}

export interface EventBooking {
  id: string;
  zoneId: string;
  from: number;
  to: number;
  organizer: string;
}

export interface FleetAllocation {
  company: string;
  from: number;
  to: number;
  bayIds: string[];
  /** 用到的区，按分配顺序 */
  zoneIds: string[];
  /** 台数全部分配到了 */
  fits: boolean;
}

export interface FleetBooking extends Omit<FleetAllocation, 'fits' | 'zoneIds'> {
  id: string;
}

/** 当前时刻和此刻有车的车位 */
export interface Occupancy {
  now: number;
  occupied: ReadonlySet<string>;
}

const overlaps = (a: { from: number; to: number }, b: { from: number; to: number }) =>
  a.from < b.to && b.from < a.to;

function checkSlot({ from, to }: { from: number; to: number }) {
  if (from % SLOT_MS !== 0 || to % SLOT_MS !== 0) throw new RangeError('times must be on 15-minute slots');
  if (to <= from) throw new RangeError('the end must be after the start');
}

const fits = (bay: Bay, req: SlotRequest) => {
  if (req.accessible) return bay.type === 'accessible';
  if (req.vehicle === 'large') return bay.type === 'large';
  if (req.vehicle === 'ev') return bay.type === 'ev';
  return bay.type === 'standard';
};

/**
 * 预约（司机，15 分钟单位）、活动包场（整区）、法人批量手配（连续车位）。
 * 三者互不重叠；月租车位不参与。
 */
export function createBookings(parking: Parking) {
  const router = createRouter(parking);
  const walk = new Map(parking.bays.map((b) => [b.id, router.walkMeters(b.id)]));
  const reservations: Reservation[] = [];
  const events: EventBooking[] = [];
  const fleets: FleetBooking[] = [];
  let reservationSeq = 0;
  let eventSeq = 0;
  let fleetSeq = 0;

  /** 车位在这段时间是否已被预约、包场或手配占用 */
  const taken = (bayId: string, slot: { from: number; to: number }) =>
    reservations.some((r) => r.bayId === bayId && overlaps(r, slot)) ||
    fleets.some((f) => f.bayIds.includes(bayId) && overlaps(f, slot)) ||
    events.some((e) => e.zoneId === parking.bay(bayId).zoneId && overlaps(e, slot));

  const free = (bay: Bay, slot: { from: number; to: number }, occ: Occupancy) =>
    bay.type !== 'monthly' &&
    !taken(bay.id, slot) &&
    !(slot.from < occ.now + SOON_MS && occ.occupied.has(bay.id));

  function available(req: SlotRequest, occ: Occupancy): Bay[] {
    checkSlot(req);
    const bays = parking.bays.filter((b) => fits(b, req) && free(b, req, occ));
    return req.nearExit ? [...bays].sort((a, b) => walk.get(a.id)! - walk.get(b.id)!) : bays;
  }

  return {
    available,
    walkMeters: (bayId: string) => walk.get(parking.bay(bayId).id)!,
    reserve(req: SlotRequest & { plate?: string }, occ: Occupancy, bayId?: string): Reservation {
      const offered = available(req, occ);
      const bay = bayId ? offered.find((b) => b.id === bayId) : offered[0];
      if (!bay) {
        throw new Error(bayId ? `bay ${parking.bay(bayId).code} is not available` : 'no bay is available');
      }
      const r: Reservation = {
        id: `R-${String(++reservationSeq).padStart(4, '0')}`,
        bayId: bay.id,
        from: req.from,
        to: req.to,
        ...(req.plate ? { plate: req.plate } : {}),
      };
      reservations.push(r);
      return r;
    },
    cancel(id: string) {
      const i = reservations.findIndex((r) => r.id === id);
      if (i < 0) throw new Error(`unknown reservation "${id}"`);
      reservations.splice(i, 1);
    },
    reservations: (): readonly Reservation[] => reservations,
    reservationAt: (bayId: string, t: number) =>
      reservations.find((r) => r.bayId === bayId && r.from <= t && t < r.to) ?? null,

    bookEvent(
      input: Omit<EventBooking, 'id'>,
    ): { ok: true; booking: EventBooking } | { ok: false; conflicts: Reservation[] } {
      checkSlot(input);
      const zone = parking.zone(input.zoneId);
      if (zone.kind === 'monthly') throw new Error('monthly zones cannot be booked for events');
      const conflicts = reservations.filter((r) => zone.bayIds.includes(r.bayId) && overlaps(r, input));
      if (conflicts.length > 0) return { ok: false, conflicts };
      const booking = { id: `E-${String(++eventSeq).padStart(4, '0')}`, ...input };
      events.push(booking);
      return { ok: true, booking };
    },
    events: (): readonly EventBooking[] => events,
    eventAt: (zoneId: string, t: number) =>
      events.find((e) => e.zoneId === zoneId && e.from <= t && t < e.to) ?? null,

    /**
     * 法人批量手配：先用大型车区，再用平面场的普通区，再从立体最高层往下；
     * 每个区里先取最长的一段连续空车位。
     */
    allocateFleet(
      input: { company: string; count: number; from: number; to: number },
      occ: Occupancy,
    ): FleetAllocation {
      checkSlot(input);
      const floor = (levelId: string) => parking.garageLevels.indexOf(levelId);
      const candidates = [
        ...parking.zones.filter((z) => z.kind === 'large'),
        ...parking.zones.filter((z) => z.kind === 'general' && z.site === 'surface'),
        ...parking.zones
          .filter((z) => z.kind === 'general' && z.site === 'garage')
          .sort((a, b) => floor(b.levelId) - floor(a.levelId)),
      ];
      const bayIds: string[] = [];
      const zoneIds: string[] = [];
      for (const zone of candidates) {
        if (bayIds.length >= input.count) break;
        const runs: Bay[][] = [];
        let run: Bay[] | null = null;
        for (const id of zone.bayIds) {
          const bay = parking.bay(id);
          if (!((bay.type === 'standard' || bay.type === 'large') && free(bay, input, occ))) {
            run = null;
          } else if (run && run.at(-1)!.index === bay.index - 1) {
            run.push(bay);
          } else {
            run = [bay];
            runs.push(run);
          }
        }
        const sorted = [...runs].sort((a, b) => b.length - a.length);
        let used = false;
        for (const run of sorted) {
          for (const bay of run) {
            if (bayIds.length >= input.count) break;
            bayIds.push(bay.id);
            used = true;
          }
        }
        if (used) zoneIds.push(zone.id);
      }
      return {
        company: input.company,
        from: input.from,
        to: input.to,
        bayIds,
        zoneIds,
        fits: bayIds.length === input.count,
      };
    },
    confirmFleet(allocation: FleetAllocation): FleetBooking {
      const booking: FleetBooking = {
        id: `F-${String(++fleetSeq).padStart(4, '0')}`,
        company: allocation.company,
        from: allocation.from,
        to: allocation.to,
        bayIds: [...allocation.bayIds],
      };
      fleets.push(booking);
      return booking;
    },
    fleets: (): readonly FleetBooking[] => fleets,
  };
}

export type Bookings = ReturnType<typeof createBookings>;

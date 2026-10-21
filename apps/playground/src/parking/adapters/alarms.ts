import { createAlarmEngine, type Parking, type ParkingAlarm } from '@indoorkit/parking';
import type { ParkingDay } from '@indoorkit/parking-simulator';

export type AlarmState = 'open' | 'acknowledged' | 'resolved';

/** 从今天 0 点起每分钟检查一次场内状态 */
const STEP_MS = 60_000;

export interface AlarmStore {
  /** 检查到 t 时刻；时刻倒退时从 0 点重新检查 */
  update(t: number): ParkingAlarm[];
  /** 按发生顺序 */
  all(): readonly ParkingAlarm[];
  state(id: string): AlarmState;
  setState(id: string, state: AlarmState): void;
  subscribe(listener: () => void): () => void;
}

/**
 * 告警和处理状态放在页面之外，换页后保留；告警页、满空地图都读同一份。
 */
export function createAlarmStore(parking: Parking, day: ParkingDay): AlarmStore {
  let engine = createAlarmEngine(parking);
  let alarms: ParkingAlarm[] = [];
  let states = new Map<string, AlarmState>();
  let checked = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of [...listeners]) l();
  };

  return {
    update(t) {
      if (t < checked) {
        engine = createAlarmEngine(parking);
        alarms = [];
        states = new Map();
        checked = 0;
      }
      const raised: ParkingAlarm[] = [];
      let since = checked;
      for (let step = checked + STEP_MS; step <= t; step += STEP_MS) {
        raised.push(...engine.check(day.snapshotAt(step, since)));
        since = step;
        checked = step;
      }
      if (raised.length > 0) {
        alarms = [...alarms, ...raised];
        notify();
      }
      return raised;
    },
    all: () => alarms,
    state: (id) => states.get(id) ?? 'open',
    setState(id, state) {
      states = new Map(states).set(id, state);
      notify();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

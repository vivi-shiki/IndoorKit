import { createAlarmEngine, type Museum, type MuseumAlarm } from '@indoorkit/museum';
import type { MuseumDay } from '@indoorkit/museum-simulator';

export type AlarmState = 'open' | 'acknowledged' | 'resolved';

/** 从今天 0 点起每分钟检查一次馆内状态 */
const STEP_MS = 60_000;

export interface AlarmStore {
  /** 检查到 t 时刻；时刻倒退时从 0 点重新检查 */
  update(t: number): MuseumAlarm[];
  /** 按发生顺序 */
  all(): readonly MuseumAlarm[];
  state(id: string): AlarmState;
  setState(id: string, state: AlarmState): void;
  subscribe(listener: () => void): () => void;
}

/** 告警和处理状态放在页面之外，换页后保留；安防页、保存环境页都读同一份 */
export function createAlarmStore(museum: Museum, day: MuseumDay): AlarmStore {
  let engine = createAlarmEngine(museum);
  let alarms: MuseumAlarm[] = [];
  let states = new Map<string, AlarmState>();
  let checked = 0;
  const listeners = new Set<() => void>();
  const notify = () => {
    for (const l of [...listeners]) l();
  };

  return {
    update(t) {
      if (t < checked) {
        engine = createAlarmEngine(museum);
        alarms = [];
        states = new Map();
        checked = 0;
      }
      const raised: MuseumAlarm[] = [];
      for (let step = checked + STEP_MS; step <= t; step += STEP_MS) {
        raised.push(...engine.check(day.snapshotAt(step)));
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

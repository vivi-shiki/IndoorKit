import { type Device, lightsOn, type Museum } from '@indoorkit/museum';
import { unit, wave } from './random';

const H = 3600_000;
const M = 60_000;
const DAY = 24 * H;

/** 演示用的设备故障和环境异常，时刻是今天的时刻 */
export interface EnvironmentIncident {
  kind: 'hvac' | 'lighting' | 'offline' | 'battery';
  /** 房间或展示柜的编号，或设备编号 */
  target: string;
  from: number;
  to: number;
}

/**
 * 今天的异常：
 * - 2F 展示室 4（彫刻）10:30 空调故障，温湿度一起上升，15:30 修好；
 * - 3F 日本画的壁柜 G6-W2 13:00 起照明故障，柜内照度远超上限；
 * - 2F 工艺独立柜的温湿度传感器 11:00～12:30 离线；展示室 1 的照度传感器电量低。
 */
export const INCIDENTS: readonly EnvironmentIncident[] = [
  { kind: 'hvac', target: 'G4', from: 10.5 * H, to: 15.5 * H },
  { kind: 'lighting', target: 'G6-W2', from: 13 * H, to: DAY },
  { kind: 'offline', target: 'TH-G2-F1', from: 11 * H, to: 12.5 * H },
  { kind: 'battery', target: 'LX-G1', from: -DAY, to: DAY },
];

const timeOfDay = (t: number) => ((t % DAY) + DAY) % DAY;
const active = (i: EnvironmentIncident, t: number) => t >= i.from && t < i.to;

/** 空调故障的程度：开始后 2 小时升到最大，修好后 1 小时恢复 */
function hvacLevel(t: number, target: string): number {
  const i = INCIDENTS.find((x) => x.kind === 'hvac' && x.target === target);
  if (!i) return 0;
  if (t < i.from) return 0;
  if (t < i.to) return Math.min(1, (t - i.from) / (2 * H));
  return Math.max(0, 1 - (t - i.to) / H);
}

/**
 * 环境读数是时刻的函数：基线 + 一天的周期 + 人多时的升温 + 平滑的噪声 + 异常。
 * 气密展示柜的湿度几乎不随展示室变化，独立柜（非气密）跟着展示室走，这是演示里可以讲的一点。
 */
export function createEnvironment(
  museum: Museum,
  seed: string,
  occupancy: (roomUnit: string, t: number) => number,
) {
  const roomClimate = (roomUnit: string, t: number) => {
    const room = museum.room(roomUnit);
    const key = `${seed}/${room.code}`;
    const phase = (2 * Math.PI * (timeOfDay(t) - 15 * H)) / DAY;
    const crowd = room.capacity ? Math.min(1.5, occupancy(roomUnit, t) / room.capacity) : 0;
    const hvac = hvacLevel(t, room.code);
    const base = room.access === 'staff' ? 21 : 21.8;
    const temperature = base + 0.5 * Math.cos(phase) + 0.8 * crowd + wave(`${key}/t`, t, 0.25) + 3.6 * hvac;
    const humidity = 54.5 + 1.8 * Math.sin(phase) + 0.6 * crowd + wave(`${key}/h`, t, 0.8) + 15 * hvac;
    return { temperature, humidity };
  };

  const caseClimate = (caseUnit: string, t: number) => {
    const c = museum.case(caseUnit);
    const room = roomClimate(c.roomId, t);
    const key = `${seed}/${c.code}`;
    if (!c.sealed) {
      return {
        temperature: room.temperature + wave(`${key}/t`, t, 0.1),
        humidity: room.humidity - 0.5 + wave(`${key}/h`, t, 0.4),
      };
    }
    return {
      temperature: room.temperature - 0.3 + wave(`${key}/t`, t, 0.1),
      humidity: 55 + 0.15 * (room.humidity - 55) + wave(`${key}/h`, t, 0.3),
    };
  };

  /** 照度：开灯时按标准的 85～95 % 设定，关灯后接近 0；照明故障时远超上限 */
  const illuminance = (unitId: string, t: number) => {
    const code = museum.isCase(unitId) ? museum.case(unitId).code : museum.room(unitId).code;
    const fault = INCIDENTS.some((i) => i.kind === 'lighting' && i.target === code && active(i, t));
    if (!lightsOn(t)) return Math.max(0, 0.5 + wave(`${seed}/${code}/dark`, t, 0.4));
    const { standard } = museum.standardOf(unitId);
    const set = standard.maxLux * (0.85 + 0.1 * unit(`${seed}/${code}/lux`));
    return (fault ? standard.maxLux * 2.4 : set) * (1 + wave(`${seed}/${code}/lux`, t, 0.02));
  };

  const climate = (unitId: string, t: number) =>
    museum.isCase(unitId) ? caseClimate(unitId, t) : roomClimate(unitId, t);

  const co2 = (roomUnit: string, t: number) => {
    const room = museum.room(roomUnit);
    return (
      430 +
      occupancy(roomUnit, t) * (room.capacity ? 900 / room.capacity : 4) +
      wave(`${seed}/${room.code}/co2`, t, 25)
    );
  };

  const status = (d: Device, t: number) => ({
    online: !INCIDENTS.some((i) => i.kind === 'offline' && i.target === d.code && active(i, t)),
    battery: INCIDENTS.some((i) => i.kind === 'battery' && i.target === d.code && active(i, t))
      ? 12
      : Math.round(55 + 45 * unit(`${seed}/${d.code}/battery`)),
  });

  return { climate, illuminance, co2, status };
}
export type Environment = ReturnType<typeof createEnvironment>;

/** 一天里每隔 step 毫秒积分一次照度，得到累计光照量（lx·h） */
export function dailyExposure(
  env: Environment,
  unitId: string,
  from: number,
  to: number,
  step = 10 * M,
): number {
  let total = 0;
  for (let t = from; t < to; t += step) {
    const end = Math.min(to, t + step);
    total += ((env.illuminance(unitId, t) + env.illuminance(unitId, end)) / 2) * ((end - t) / H);
  }
  return total;
}

import type { StatusPaint } from '@indoorkit/core';

const WINDOW_MS = 3_600_000;

/** 最近一小时内报过警的房间：出现过高级别告警为红，其余为黄；按第一次报警的顺序 */
export function museumRoomStatus(
  alarms: readonly { unitId: string; levelId: string; level: string; time: number }[],
  time: number,
): StatusPaint[] {
  const rooms = new Map<string, StatusPaint>();
  for (const alarm of alarms) {
    if (alarm.time > time || alarm.time <= time - WINDOW_MS) continue;
    const status = alarm.level === 'high' ? 'critical' : 'warn';
    const seen = rooms.get(alarm.unitId);
    if (!seen) rooms.set(alarm.unitId, { unitId: alarm.unitId, levelId: alarm.levelId, status });
    else if (status === 'critical') seen.status = 'critical';
  }
  return [...rooms.values()];
}

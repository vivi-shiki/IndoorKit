import type { Museum } from './model';

const M = 60_000;

/** 换展、借出、入库时一件藏品的计划移动 */
export interface ObjectMove {
  id: string;
  objectId: string;
  /** 从哪个展示柜或库房到哪个 */
  from: string;
  to: string;
  /** 计划时刻 */
  at: number;
}

/** 门口的 RFID 读写器读到一件藏品 */
export interface RfidRead {
  objectId: string;
  deviceId: string;
  time: number;
}

/** 按计划到达、读到的地方不对、还没到时间、过了时间还没读到 */
export type MoveStatus = 'done' | 'wrong-place' | 'pending' | 'overdue';

export interface MoveResult {
  move: ObjectMove;
  status: MoveStatus;
  /** 计划开始之后最后一次读到的地点（房间）和时刻 */
  lastRead: { unitId: string; time: number } | null;
}

/** 计划时刻过后这么久还没在目的地读到算超时 */
export const MOVE_GRACE_MS = 30 * M;

/**
 * 换展核对：拿计划和读写器的记录对比。
 * 读写器装在房间门口，所以按房间比较：目的地是展示柜时看它所在的展示室。
 */
export function checkMoves(
  museum: Museum,
  moves: readonly ObjectMove[],
  reads: readonly RfidRead[],
  now: number,
): MoveResult[] {
  return moves.map((move) => {
    const target = museum.roomOf(move.to).unitId;
    const source = museum.roomOf(move.from).unitId;
    const seen = reads
      .filter((r) => r.objectId === move.objectId && r.time >= move.at - MOVE_GRACE_MS && r.time <= now)
      .map((r) => ({ unitId: museum.device(r.deviceId).unitId, time: r.time }))
      .sort((a, b) => a.time - b.time);
    const lastRead = seen.at(-1) ?? null;
    let status: MoveStatus;
    if (lastRead?.unitId === target) status = 'done';
    else if (lastRead && lastRead.unitId !== source) status = 'wrong-place';
    else status = now > move.at + MOVE_GRACE_MS ? 'overdue' : 'pending';
    return { move, status, lastRead };
  });
}

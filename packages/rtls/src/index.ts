/**
 * 实时定位（RTLS）的数据契约：定位标签、一次上报、数据源，以及把上报广播给插件的 positions:update 事件。
 * 核心只管地图；用到实时位置的插件和应用从这里取类型。
 */

/** 一个定位标签在某一时刻的位置 */
export interface TagPosition {
  id: string;
  levelId: string;
  coord: [number, number];
  /** 标签随位置一起上报的状态；SDK 不解释它的取值，由应用决定含义 */
  status?: string;
}

/** 一次上报：time 为数据源时间（毫秒） */
export interface PositionBatch {
  time: number;
  positions: TagPosition[];
}

/** 实时位置数据源；模拟器、WebSocket 等都实现这个接口 */
export interface DataProvider {
  start(): void | Promise<void>;
  stop(): void | Promise<void>;
  subscribe(listener: (batch: PositionBatch) => void): () => void;
  /** 停止并释放全部资源（定时器、Worker），之后不能再使用 */
  dispose(): void;
}

declare module '@indoorkit/core' {
  interface IndoorEvents {
    'positions:update': PositionBatch;
  }
}

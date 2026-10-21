/**
 * 停车场的车辆模拟：按种子生成昨天和今天的全部停车、预约和设备故障，
 * 任意时刻的场内状态、事件和行驶中的车辆位置都由这份计划算出。
 */
export { createParkingFeed, type ParkingFeed, type ParkingFeedOptions } from './feed';
export * from './simulation';

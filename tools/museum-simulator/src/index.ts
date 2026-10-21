/**
 * 博物馆的一天：环境读数（含空调和照明故障）、来馆者与警卫的移动、藏品的光照量、
 * 换展计划与 RFID 记录、安防事件。任意时刻的状态都由种子和时刻算出。
 */
export { createMuseumDay, DAY_OF_YEAR, type MuseumDay, type MuseumDayOptions, type ObjectState } from './day';
export { type EnvironmentIncident, INCIDENTS } from './environment';
export { createMuseumFeed, type MuseumFeedOptions } from './feed';
export type { Guard, PatrolRound, Segment, Visitor } from './people';

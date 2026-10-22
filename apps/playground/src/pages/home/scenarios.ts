import type { MessageKey } from '../../i18n';

export interface Scenario {
  id: 'hospital' | 'parking' | 'museum';
  title: MessageKey;
  description: MessageKey;
  /** 可以打开的演示地址；没有时表示开发中 */
  href?: string;
}

/**
 * 首页并排展示的三个应用场景：医院、停车场和博物馆，场馆都是虚构的。
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'hospital',
    title: 'scenario.hospital.title',
    description: 'scenario.hospital.desc',
    href: '#/hospital',
  },
  {
    id: 'parking',
    title: 'scenario.parking.title',
    description: 'scenario.parking.desc',
    href: '#/parking',
  },
  {
    id: 'museum',
    title: 'scenario.museum.title',
    description: 'scenario.museum.desc',
    href: '#/museum',
  },
];

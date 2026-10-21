import type { MessageKey } from '../../i18n';

export interface Scenario {
  id: 'hospital' | 'parking' | 'museum';
  title: MessageKey;
  description: MessageKey;
  /** 场景里的业务视图：名称和一句话说明 */
  views: { title: MessageKey; desc: MessageKey }[];
  /** 可以打开的演示地址；没有时表示开发中 */
  href?: string;
}

/**
 * 首页走马灯里的应用场景。医院和停车场演示已完成，博物馆的说明来自 demo 规划，
 * 场馆都是虚构的。
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: 'hospital',
    title: 'scenario.hospital.title',
    description: 'scenario.hospital.desc',
    views: [
      { title: 'group.efficiency.title', desc: 'group.efficiency.desc' },
      { title: 'group.people.title', desc: 'group.people.desc' },
    ],
    href: '#/hospital',
  },
  {
    id: 'parking',
    title: 'scenario.parking.title',
    description: 'scenario.parking.desc',
    views: [
      { title: 'scenario.parking.operator.title', desc: 'scenario.parking.operator.desc' },
      { title: 'scenario.parking.driver.title', desc: 'scenario.parking.driver.desc' },
    ],
    href: '#/parking',
  },
  {
    id: 'museum',
    title: 'scenario.museum.title',
    description: 'scenario.museum.desc',
    views: [
      { title: 'scenario.museum.curator.title', desc: 'scenario.museum.curator.desc' },
      { title: 'scenario.museum.operations.title', desc: 'scenario.museum.operations.desc' },
      { title: 'scenario.museum.visitor.title', desc: 'scenario.museum.visitor.desc' },
    ],
  },
];

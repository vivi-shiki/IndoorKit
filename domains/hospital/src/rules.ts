import type { AlarmSubject, DepartmentRule } from './alarm';
import type { Roster } from './model';

/**
 * 第一层科室规则：设备和患者离开本科室、访客进入探视科室以外的科室会报警；
 * 医护跨科室会诊、支援是常态，不在这一层限制。
 */
export const DEPARTMENT_RULES: DepartmentRule[] = [
  { id: 'asset-outside', selector: { kinds: ['asset'] }, when: 'outside-own', graceMs: 60_000, level: 'low' },
  { id: 'asset-enter-other', selector: { kinds: ['asset'] }, when: 'enter-other', level: 'medium' },
  {
    id: 'patient-outside',
    selector: { roles: ['patient'] },
    when: 'outside-own',
    graceMs: 30_000,
    level: 'high',
  },
  { id: 'visitor-enter-other', selector: { roles: ['visitor'] }, when: 'enter-other', level: 'medium' },
];

/** 名册里的人员和设备，作为报警对象 */
export const subjectsOf = (roster: Roster): AlarmSubject[] => [
  ...roster.people.map((p) => ({
    id: p.id,
    kind: 'person' as const,
    role: p.role,
    departmentId: p.departmentId,
  })),
  ...roster.assets.map((a) => ({
    id: a.id,
    kind: 'asset' as const,
    type: a.type,
    departmentId: a.departmentId,
  })),
];

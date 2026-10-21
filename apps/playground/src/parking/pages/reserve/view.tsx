import { SLOT_MS } from '@indoorkit/parking';
import type { ReactNode } from 'react';
import { useParkingT } from '../../i18n';
import { clockText } from '../../presentation/format';

const DAY = 24 * 3600_000;

/** 从 from 起到当天结束的 15 分钟时刻 */
export const slotsFrom = (from: number) => {
  const first = Math.ceil(from / SLOT_MS) * SLOT_MS;
  const out: number[] = [];
  for (let t = first; t < DAY; t += SLOT_MS) out.push(t);
  return out;
};

export const DURATIONS = [30, 60, 120, 180, 240, 480] as const;

/** 带标签的表单项 */
export function Field(props: { label: string; children: ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: 控件由 children 传入，就在 label 里面
    <label className="field">
      <span>{props.label}</span>
      {props.children}
    </label>
  );
}

/** 开始时刻下拉框 */
export function StartSelect(props: {
  testId: string;
  slots: number[];
  value: number;
  onChange: (t: number) => void;
}) {
  const t = useParkingT();
  return (
    <Field label={t('form.start')}>
      <select
        data-testid={props.testId}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      >
        {props.slots.map((s) => (
          <option key={s} value={s}>
            {clockText(s)}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** 时长下拉框（分钟） */
export function DurationSelect(props: { testId: string; value: number; onChange: (m: number) => void }) {
  const t = useParkingT();
  return (
    <Field label={t('form.duration')}>
      <select
        data-testid={props.testId}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      >
        {DURATIONS.map((m) => (
          <option key={m} value={m}>
            {m < 60 ? t('form.minutes', { value: m }) : t('form.hours', { value: m / 60 })}
          </option>
        ))}
      </select>
    </Field>
  );
}

/** 结果里的一行：名称和值 */
export function ResultRow(props: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{props.label}</dt>
      <dd>{props.children}</dd>
    </>
  );
}

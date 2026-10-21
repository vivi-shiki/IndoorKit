import type { ReactNode } from 'react';
import { useT } from '../app-i18n';
import type { MessageKey } from '../i18n';

/** 页面上的小部件：筛选 chip 组、单选组、限频 */

export interface ChipItem {
  value: string;
  text: string;
  /** 色点颜色 */
  color?: string;
}

/** 多选 chip 组：一个都没选时表示不筛选，悬停提示里写明 */
export function ChipGroup(props: {
  testId: string;
  items: ChipItem[];
  selected: ReadonlySet<string>;
  onChange: (selected: ReadonlySet<string>) => void;
}) {
  const t = useT();
  const toggle = (value: string) => {
    const next = new Set(props.selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    props.onChange(next);
  };
  return (
    <span className="chips" title={t('filter.allWhenEmpty')}>
      {props.items.map((item) => (
        <button
          key={item.value}
          type="button"
          className="chip"
          data-testid={props.testId}
          data-value={item.value}
          aria-pressed={props.selected.has(item.value)}
          onClick={() => toggle(item.value)}
        >
          {item.color && <span className="dot" style={{ background: item.color }} />}
          {item.text}
        </button>
      ))}
    </span>
  );
}

/** 标题栏里的单选组 */
export function RadioGroup(props: {
  name: string;
  label: MessageKey;
  values: { value: string; text: ReactNode }[];
  selected: string;
  onChange: (value: string) => void;
}) {
  const t = useT();
  return (
    <fieldset className="radios">
      <legend>{t(props.label)}</legend>
      {props.values.map((v) => (
        <label key={v.value} className="radio">
          <input
            type="radio"
            name={props.name}
            value={v.value}
            checked={v.value === props.selected}
            onChange={() => props.onChange(v.value)}
          />
          {v.text}
        </label>
      ))}
    </fieldset>
  );
}

export { throttle } from '../app/map';

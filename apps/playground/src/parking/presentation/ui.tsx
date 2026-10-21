import { useParkingT } from '../i18n';

export interface ChipItem {
  value: string;
  text: string;
  /** 色点颜色 */
  color?: string;
}

/** 多选 chip 组：一个都没选时表示不筛选，悬停提示里写明 */
export function ChipGroup(props: {
  testId: string;
  label: string;
  items: ChipItem[];
  selected: ReadonlySet<string>;
  onChange: (selected: ReadonlySet<string>) => void;
}) {
  const t = useParkingT();
  const toggle = (value: string) => {
    const next = new Set(props.selected);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    props.onChange(next);
  };
  return (
    // biome-ignore lint/a11y/useSemanticElements: chip 组是一排切换按钮，不是表单分组
    <span className="chips" role="group" aria-label={props.label} title={t('filter.allWhenEmpty')}>
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

/** 单选 chip 组（倍速、时段） */
export function ChoiceChips<T extends string | number>(props: {
  testId: string;
  label: string;
  items: { value: T; text: string }[];
  selected: T;
  onChange: (value: T) => void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: 同上
    <span className="chips" role="group" aria-label={props.label}>
      {props.items.map((item) => (
        <button
          key={item.value}
          type="button"
          className="chip"
          data-testid={props.testId}
          aria-pressed={item.value === props.selected}
          onClick={() => props.onChange(item.value)}
        >
          {item.text}
        </button>
      ))}
    </span>
  );
}

/** 标题栏里的一个指标 */
export function Metric(props: {
  label: string;
  testId: string;
  value: string | number;
  total?: { value: number; testId: string };
}) {
  return (
    <span className="metric">
      {props.label}: <b data-testid={props.testId}>{props.value}</b>
      {props.total !== undefined && (
        <>
          {' / '}
          <b data-testid={props.total.testId}>{props.total.value}</b>
        </>
      )}
    </span>
  );
}

/** 状态色例 */
export function Legend(props: { items: { color: string; text: string }[] }) {
  return (
    <ul className="legend" data-testid="legend">
      {props.items.map((item) => (
        <li key={item.text}>
          <span className="swatch" style={{ background: item.color }} />
          {item.text}
        </li>
      ))}
    </ul>
  );
}

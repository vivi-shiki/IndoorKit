/** 页面上的小部件：筛选 chip 组、列表行、HTML 转义 */

export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

export interface ChipItem {
  value: string;
  text: string;
  /** 色点颜色 */
  color?: string;
}

/**
 * 多选 chip 组：一个都没选时表示不筛选。
 * 返回 render（语言切换后用新文字重画）和当前选择。
 */
export function chipGroup(options: {
  container: HTMLElement;
  testId: string;
  items: () => ChipItem[];
  onChange: (selected: ReadonlySet<string>) => void;
}) {
  const selected = new Set<string>();
  const render = () => {
    options.container.replaceChildren(
      ...options.items().map((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'chip';
        button.dataset.testid = options.testId;
        button.dataset.value = item.value;
        button.setAttribute('aria-pressed', String(selected.has(item.value)));
        if (item.color) {
          const dot = document.createElement('span');
          dot.className = 'dot';
          dot.style.background = item.color;
          button.append(dot);
        }
        button.append(item.text);
        button.addEventListener('click', () => {
          if (selected.has(item.value)) selected.delete(item.value);
          else selected.add(item.value);
          button.setAttribute('aria-pressed', String(selected.has(item.value)));
          options.onChange(selected);
        });
        return button;
      }),
    );
  };
  render();
  return { render, selected: () => selected as ReadonlySet<string> };
}

/** 至少隔 ms 毫秒才执行一次，用来限制列表重画频率 */
export function throttle(fn: () => void, ms: number) {
  let last = -Infinity;
  return (force = false) => {
    const now = performance.now();
    if (!force && now - last < ms) return;
    last = now;
    fn();
  };
}

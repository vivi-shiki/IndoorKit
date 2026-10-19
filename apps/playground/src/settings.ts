export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** 读取保存的选项；值不在候选里或 storage 不可用时返回 undefined */
export function readChoice<T extends string>(
  storage: StorageLike,
  key: string,
  values: readonly T[],
): T | undefined {
  try {
    const saved = storage.getItem(key);
    return values.includes(saved as T) ? (saved as T) : undefined;
  } catch {
    // 隐私模式等情况下 storage 不可用，按未保存处理
    return undefined;
  }
}

export interface Choice<T extends string> {
  readonly value: T;
  set(value: T): void;
  subscribe(listener: (value: T) => void): () => void;
}

/** 保存在 localStorage 里的界面选项（语言、主题），变化时通知订阅者 */
export function createChoice<T extends string>(options: {
  storage: StorageLike;
  key: string;
  initial: T;
}): Choice<T> {
  let value = options.initial;
  const listeners = new Set<(value: T) => void>();
  return {
    get value() {
      return value;
    },
    set(next) {
      if (next === value) return;
      value = next;
      try {
        options.storage.setItem(options.key, next);
      } catch {
        // 保存失败时本次会话仍然生效
      }
      for (const listener of [...listeners]) listener(next);
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

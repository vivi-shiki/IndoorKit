interface Entry {
  dispose: () => void;
  label: string;
}

/** 登记资源，销毁时按创建的逆序统一释放 */
export class ResourceTracker {
  #entries: Entry[] = [];

  track<T>(value: T, dispose: (value: T) => void, label = 'resource'): T {
    this.#entries.push({ dispose: () => dispose(value), label });
    return value;
  }

  get size(): number {
    return this.#entries.length;
  }

  labels(): string[] {
    return this.#entries.map((e) => e.label);
  }

  /** 释放全部资源；单个释放失败不会中断其余释放，错误会被收集返回 */
  disposeAll(): Error[] {
    const errors: Error[] = [];
    const entries = this.#entries;
    this.#entries = [];
    for (let i = entries.length - 1; i >= 0; i--) {
      try {
        entries[i]!.dispose();
      } catch (e) {
        errors.push(e instanceof Error ? e : new Error(String(e)));
      }
    }
    return errors;
  }
}

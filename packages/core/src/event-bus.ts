type Handler<T> = (payload: T) => void;

/** 类型化事件总线；插件之间只通过它通信 */
export class EventBus<E extends object> {
  #handlers = new Map<keyof E, Set<Handler<never>>>();

  on<K extends keyof E>(type: K, handler: Handler<E[K]>): () => void {
    let set = this.#handlers.get(type);
    if (!set) {
      set = new Set();
      this.#handlers.set(type, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(type, handler);
  }

  off<K extends keyof E>(type: K, handler: Handler<E[K]>): void {
    this.#handlers.get(type)?.delete(handler as Handler<never>);
  }

  emit<K extends keyof E>(type: K, payload: E[K]): void {
    for (const handler of [...(this.#handlers.get(type) ?? [])]) (handler as Handler<E[K]>)(payload);
  }

  listenerCount(): number {
    let n = 0;
    for (const set of this.#handlers.values()) n += set.size;
    return n;
  }

  clear(): void {
    this.#handlers.clear();
  }
}

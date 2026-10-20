/**
 * 页面卸载时释放地图和 Worker 是异步的。路由等这里登记的释放全部结束，
 * 才挂载下一个页面，保证任何时候最多只有一张地图。
 */
const pending = new Set<Promise<unknown>>();

export function trackTeardown(promise: Promise<unknown>) {
  const tracked = promise.catch((error: unknown) => {
    console.error('[playground] failed to release page', error);
  });
  pending.add(tracked);
  void tracked.finally(() => pending.delete(tracked));
}

export const teardownSettled = () => Promise.all([...pending]);

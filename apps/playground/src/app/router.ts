import { useEffect, useState } from 'react';
import { parseRoute, type Route } from './routes';
import { teardownSettled } from './teardown';

function readRoute(): Route {
  const { route, redirect } = parseRoute(location.hash);
  // 规范地址只替换当前历史记录，后退仍回到上一页
  if (redirect) history.replaceState(history.state, '', redirect);
  return route;
}

/** 当前 hash 对应的页面 */
export function useHashRoute(): Route {
  const [route, setRoute] = useState(readRoute);
  useEffect(() => {
    const onChange = () => setRoute(readRoute());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return route;
}

/**
 * 路由按顺序切换：key 变化时先返回 null 让上一页卸载，
 * 等它登记的释放（地图、Worker）全部完成后才返回新的值。
 */
export function useSettled<T>(key: string, value: T): T | null {
  const [settled, setSettled] = useState(key);
  useEffect(() => {
    if (settled === key) return;
    let cancelled = false;
    void teardownSettled().then(() => {
      if (!cancelled) setSettled(key);
    });
    return () => {
      cancelled = true;
    };
  }, [key, settled]);
  return settled === key ? value : null;
}

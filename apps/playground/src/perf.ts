export interface PerfSnapshot {
  fps: number;
  frameMs: number;
  tags: number;
}

/**
 * 性能浮层：每秒统计帧数和平均帧间隔，每 500 ms 刷新一次显示。
 * 浮层和测试钩子读同一个快照，数字一定一致。
 */
export function mountPerfOverlay(el: HTMLElement, tagCount: () => number) {
  el.innerHTML = `
    <div><span data-i18n="metric.fps"></span> <b data-perf="fps">0</b></div>
    <div><span data-i18n="metric.frameMs"></span> <b data-perf="frame-ms">0</b></div>
    <div><span data-i18n="metric.tags"></span> <b data-perf="tags">0</b></div>`;
  let snapshot: PerfSnapshot = { fps: 0, frameMs: 0, tags: 0 };
  const frames: number[] = [];
  let handle = requestAnimationFrame(function loop(now) {
    frames.push(now);
    while (frames.length > 0 && frames[0]! < now - 1000) frames.shift();
    handle = requestAnimationFrame(loop);
  });
  const show = () => {
    const span = frames.length > 1 ? frames.at(-1)! - frames[0]! : 0;
    snapshot = {
      fps: frames.length,
      frameMs: frames.length > 1 ? Math.round((span / (frames.length - 1)) * 10) / 10 : 0,
      tags: tagCount(),
    };
    el.querySelector('[data-perf="fps"]')!.textContent = String(snapshot.fps);
    el.querySelector('[data-perf="frame-ms"]')!.textContent = String(snapshot.frameMs);
    el.querySelector('[data-perf="tags"]')!.textContent = String(snapshot.tags);
  };
  const timer = setInterval(show, 500);
  return {
    snapshot: () => snapshot,
    dispose() {
      cancelAnimationFrame(handle);
      clearInterval(timer);
    },
  };
}

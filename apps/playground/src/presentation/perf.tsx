import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';
import { useT } from '../app-i18n';

export interface PerfSnapshot {
  fps: number;
  frameMs: number;
  tags: number;
}

/**
 * 性能浮层：每秒统计帧数和平均帧间隔，每 500 ms 刷新一次显示。
 * 浮层和测试钩子读同一个快照：快照更新后同步提交到界面，两者一定一致。
 */
export function PerfOverlay(props: {
  tagCount: () => number;
  onSnapshot: (read: () => PerfSnapshot) => void;
}) {
  const t = useT();
  const [snapshot, setSnapshot] = useState<PerfSnapshot>({ fps: 0, frameMs: 0, tags: 0 });
  const { tagCount, onSnapshot } = props;

  useEffect(() => {
    let current: PerfSnapshot = { fps: 0, frameMs: 0, tags: 0 };
    onSnapshot(() => current);
    const frames: number[] = [];
    let handle = requestAnimationFrame(function loop(now) {
      frames.push(now);
      while (frames.length > 0 && frames[0]! < now - 1000) frames.shift();
      handle = requestAnimationFrame(loop);
    });
    const timer = setInterval(() => {
      const span = frames.length > 1 ? frames.at(-1)! - frames[0]! : 0;
      current = {
        fps: frames.length,
        frameMs: frames.length > 1 ? Math.round((span / (frames.length - 1)) * 10) / 10 : 0,
        tags: tagCount(),
      };
      const next = current;
      flushSync(() => setSnapshot(next));
    }, 500);
    return () => {
      cancelAnimationFrame(handle);
      clearInterval(timer);
    };
  }, [tagCount, onSnapshot]);

  return (
    <div className="perf" data-testid="perf">
      <div>
        <span>{t('metric.fps')}</span> <b data-perf="fps">{snapshot.fps}</b>
      </div>
      <div>
        <span>{t('metric.frameMs')}</span> <b data-perf="frame-ms">{snapshot.frameMs}</b>
      </div>
      <div>
        <span>{t('metric.tags')}</span> <b data-perf="tags">{snapshot.tags}</b>
      </div>
    </div>
  );
}

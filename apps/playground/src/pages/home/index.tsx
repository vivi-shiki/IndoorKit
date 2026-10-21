import Typography from '@mui/material/Typography';
import { type PointerEvent, useEffect, useRef, useState } from 'react';
import { usePageTitle, useT } from '../../app-i18n';
import { setHooks } from '../../testing/hooks';
import { HomeBackdrop } from './backdrop-view';
import { slotOf } from './carousel';
import { SCENARIOS } from './scenarios';
import { CarouselControls, Footer, Hero, ScenarioSlide } from './view';

/** 自动切换的间隔；有人操作过走马灯之后不再自动切换 */
const AUTOPLAY_MS = 6000;
/** 卡片换位的过渡时长（与 style.css 一致）；换位期间鼠标扫过别的卡片不算悬停 */
const MOVE_MS = 450;
/** 手指横向滑过这么多像素算一次切换 */
const SWIPE_PX = 40;

const TOTAL = SCENARIOS.length;

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 首页：介绍 IndoorKit，并用走马灯展示医院、停车场、博物馆三个应用场景，聚焦的一张在中间 */
export function HomePage() {
  const t = useT();
  usePageTitle(null);
  useEffect(() => {
    setHooks({ demo: 'home', ready: true });
  }, []);

  const [index, setIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(() => !prefersReducedMotion());
  // 鼠标悬停或键盘焦点在走马灯里时暂停
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (!autoplay || paused) return;
    const timer = setInterval(() => setIndex((i) => (i + 1) % TOTAL), AUTOPLAY_MS);
    return () => clearInterval(timer);
  }, [autoplay, paused]);

  const movedAt = useRef(0);
  const go = (next: number) => {
    setAutoplay(false);
    movedAt.current = performance.now();
    setIndex((next + TOTAL) % TOTAL);
  };
  // 鼠标移到或点到两侧的卡片上，它就滚到中间；刚换过位时，指针下面换上来的卡片不算
  const focusSide = (i: number) => {
    if (i !== index && performance.now() - movedAt.current > MOVE_MS) go(i);
  };

  const swipeFrom = useRef<number | null>(null);
  const onPointerDown = (e: PointerEvent) => {
    if (e.pointerType === 'touch') swipeFrom.current = e.clientX;
  };
  const onPointerUp = (e: PointerEvent) => {
    if (swipeFrom.current === null) return;
    const dx = e.clientX - swipeFrom.current;
    swipeFrom.current = null;
    if (Math.abs(dx) >= SWIPE_PX) go(index + (dx < 0 ? 1 : -1));
  };

  return (
    <main className="home">
      <HomeBackdrop />
      <Hero />
      <section
        className="carousel"
        aria-roledescription={t('home.carousel')}
        aria-labelledby="scenarios-title"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
      >
        <Typography id="scenarios-title" variant="h5" component="h2" sx={{ fontWeight: 700, mb: 2 }}>
          {t('home.scenarios')}
        </Typography>
        <div className="carousel-viewport" onPointerDown={onPointerDown} onPointerUp={onPointerUp}>
          {SCENARIOS.map((scenario, i) => (
            <ScenarioSlide
              key={scenario.id}
              scenario={scenario}
              slot={slotOf(i, index, TOTAL)}
              position={i + 1}
              total={TOTAL}
              onFocusSide={() => focusSide(i)}
            />
          ))}
        </div>
        <CarouselControls scenarios={SCENARIOS} index={index} go={go} />
      </section>
      <Footer />
    </main>
  );
}

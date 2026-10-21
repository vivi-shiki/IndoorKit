import Typography from '@mui/material/Typography';
import { useEffect, useState } from 'react';
import { usePageTitle, useT } from '../../app-i18n';
import { setHooks } from '../../testing/hooks';
import { SCENARIOS } from './scenarios';
import { CarouselControls, Footer, Hero, ScenarioSlide } from './view';

/** 自动切换的间隔；有人操作过走马灯之后不再自动切换 */
const AUTOPLAY_MS = 6000;

const TOTAL = SCENARIOS.length;

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 首页：介绍 IndoorKit，并用走马灯切换医院、停车场、博物馆三个应用场景 */
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
  const go = (next: number) => {
    setAutoplay(false);
    setIndex((next + TOTAL) % TOTAL);
  };

  return (
    <main className="home">
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
        <div className="carousel-viewport">
          <div className="carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
            {SCENARIOS.map((scenario, i) => (
              <ScenarioSlide
                key={scenario.id}
                scenario={scenario}
                active={i === index}
                position={i + 1}
                total={TOTAL}
              />
            ))}
          </div>
        </div>
        <CarouselControls scenarios={SCENARIOS} index={index} go={go} />
      </section>
      <Footer />
    </main>
  );
}

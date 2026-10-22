import { useTheme } from '@mui/material/styles';
import Typography from '@mui/material/Typography';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useEffect, useState } from 'react';
import { usePageTitle, useT } from '../../app-i18n';
import { setHooks } from '../../testing/hooks';
import { HomeBackdrop } from './backdrop-view';
import { SCENARIOS } from './scenarios';
import { CarouselControls, Footer, Hero, ScenarioCard } from './view';

/** 自动切换的间隔；有人操作过走马灯之后不再自动切换 */
const AUTOPLAY_MS = 6000;

const TOTAL = SCENARIOS.length;

const prefersReducedMotion = () =>
  typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 首页：介绍 IndoorKit 和医院、停车场、博物馆三个应用场景。电脑上三张卡片并排，手机上是走马灯 */
export function HomePage() {
  usePageTitle(null);
  useEffect(() => {
    setHooks({ demo: 'home', ready: true });
  }, []);
  const theme = useTheme();
  const desktop = useMediaQuery(theme.breakpoints.up('sm'), { noSsr: true });

  return (
    <main className="home">
      <HomeBackdrop />
      <Hero />
      {desktop ? <ScenarioGrid /> : <ScenarioCarousel />}
      <Footer />
    </main>
  );
}

function ScenariosTitle() {
  const t = useT();
  return (
    <Typography id="scenarios-title" variant="h5" component="h2" sx={{ fontWeight: 700, mb: 2 }}>
      {t('home.scenarios')}
    </Typography>
  );
}

/** 电脑上三个场景并排 */
function ScenarioGrid() {
  return (
    <section aria-labelledby="scenarios-title">
      <ScenariosTitle />
      <div className="scenarios">
        {SCENARIOS.map((scenario) => (
          <ScenarioCard key={scenario.id} scenario={scenario} />
        ))}
      </div>
    </section>
  );
}

/** 手机上一次显示一个场景，左右切换，没人操作时自动轮播 */
function ScenarioCarousel() {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [autoplay, setAutoplay] = useState(() => !prefersReducedMotion());
  // 手指或键盘焦点在走马灯里时暂停
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
    <section
      className="carousel"
      aria-roledescription={t('home.carousel')}
      aria-labelledby="scenarios-title"
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <ScenariosTitle />
      <div className="carousel-viewport">
        <div className="carousel-track" style={{ transform: `translateX(-${index * 100}%)` }}>
          {SCENARIOS.map((scenario, i) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              slide={{ active: i === index, position: i + 1, total: TOTAL }}
            />
          ))}
        </div>
      </div>
      <CarouselControls scenarios={SCENARIOS} index={index} go={go} />
    </section>
  );
}

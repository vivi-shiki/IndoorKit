import Typography from '@mui/material/Typography';
import { useEffect } from 'react';
import { usePageTitle, useT } from '../../app-i18n';
import { setHooks } from '../../testing/hooks';
import { SCENARIOS } from './scenarios';
import { Footer, Hero, ScenarioCard } from './view';

/** 首页：介绍 IndoorKit，并把医院、停车场、博物馆三个应用场景并排展示 */
export function HomePage() {
  const t = useT();
  usePageTitle(null);
  useEffect(() => {
    setHooks({ demo: 'home', ready: true });
  }, []);

  return (
    <main className="home">
      <Hero />
      <section aria-labelledby="scenarios-title">
        <Typography id="scenarios-title" variant="h5" component="h2" sx={{ fontWeight: 700, mb: 2 }}>
          {t('home.scenarios')}
        </Typography>
        <div className="scenarios">
          {SCENARIOS.map((scenario) => (
            <ScenarioCard key={scenario.id} scenario={scenario} />
          ))}
        </div>
      </section>
      <Footer />
    </main>
  );
}

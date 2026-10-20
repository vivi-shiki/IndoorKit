import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import GitHubIcon from '@mui/icons-material/GitHub';
import LocalParkingIcon from '@mui/icons-material/LocalParking';
import MuseumIcon from '@mui/icons-material/Museum';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import IconButton from '@mui/material/IconButton';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import hospitalShot from '../../../../../docs/images/tracking.png';
import { useT } from '../../app-i18n';
import type { Scenario } from './scenarios';

export const REPO = 'https://github.com/vivi-shiki/IndoorKit';

/** 页首：SDK 名称、一句话介绍和仓库链接 */
export function Hero() {
  const t = useT();
  return (
    <Box component="header" sx={{ mb: 4 }}>
      <Typography variant="h3" component="h1" sx={{ fontWeight: 800, mb: 1 }}>
        IndoorKit
      </Typography>
      <Typography data-testid="home-tagline" sx={{ fontSize: 18, fontWeight: 600, mb: 1 }}>
        {t('home.tagline')}
      </Typography>
      <Typography color="text.secondary" sx={{ mb: 1.5 }}>
        {t('home.intro')}
      </Typography>
      <Link href={REPO} sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        <GitHubIcon fontSize="small" />
        GitHub
      </Link>
    </Box>
  );
}

const VISUALS: Record<Scenario['id'], ReactNode> = {
  hospital: <img src={hospitalShot} alt="" />,
  parking: <LocalParkingIcon />,
  museum: <MuseumIcon />,
};

/** 走马灯里的一页：场景说明、业务视图、打开按钮和示意图；开发中的场景置灰 */
export function ScenarioSlide(props: {
  scenario: Scenario;
  active: boolean;
  position: number;
  total: number;
}) {
  const t = useT();
  const { scenario, active } = props;
  const disabled = scenario.href === undefined;
  return (
    <Paper
      component="article"
      variant="outlined"
      className="scenario"
      data-scenario={scenario.id}
      data-active={String(active)}
      data-disabled={disabled ? 'true' : undefined}
      aria-roledescription="slide"
      aria-label={t('home.slide', { index: props.position, total: props.total })}
      aria-hidden={!active}
      inert={!active}
    >
      <div className="scenario-text">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography variant="h5" component="h3" sx={{ fontWeight: 700 }}>
            {t(scenario.title)}
          </Typography>
          {disabled && <Chip data-testid="coming-soon" size="small" label={t('home.comingSoon')} />}
        </Box>
        <Typography data-testid="scenario-description" component="p" sx={{ mb: 2 }}>
          {t(scenario.description)}
        </Typography>
        <Box component="ul" sx={{ m: 0, mb: 2, p: 0, listStyle: 'none', display: 'grid', gap: 1 }}>
          {scenario.views.map((view) => (
            <li key={view.title} data-testid="scenario-view">
              <strong>{t(view.title)}</strong>
              <Typography component="p" variant="body2" color="text.secondary">
                {t(view.desc)}
              </Typography>
            </li>
          ))}
        </Box>
        {disabled ? (
          <Button variant="contained" disabled>
            {t('home.open')}
          </Button>
        ) : (
          <Button variant="contained" href={scenario.href} endIcon={<ChevronRightIcon />}>
            {t('home.open')}
          </Button>
        )}
      </div>
      <div className="scenario-visual" data-visual={scenario.id}>
        {VISUALS[scenario.id]}
      </div>
    </Paper>
  );
}

/** 走马灯下方的前后按钮和圆点 */
export function CarouselControls(props: {
  scenarios: readonly Scenario[];
  index: number;
  go: (index: number) => void;
}) {
  const t = useT();
  const { scenarios, index, go } = props;
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1, mt: 2 }}>
      <IconButton aria-label={t('home.previous')} onClick={() => go(index - 1)}>
        <ChevronLeftIcon />
      </IconButton>
      {scenarios.map((s, i) => (
        <button
          key={s.id}
          type="button"
          className="carousel-dot"
          data-testid="carousel-dot"
          aria-label={t(s.title)}
          aria-current={i === index}
          onClick={() => go(i)}
        />
      ))}
      <IconButton aria-label={t('home.next')} onClick={() => go(index + 1)}>
        <ChevronRightIcon />
      </IconButton>
    </Box>
  );
}

/** 页脚：虚构数据说明 */
export function Footer() {
  const t = useT();
  return (
    <Typography component="footer" color="text.secondary" sx={{ mt: 4, fontSize: 14 }}>
      {t('gallery.note')} <Link href={REPO}>GitHub</Link>
    </Typography>
  );
}

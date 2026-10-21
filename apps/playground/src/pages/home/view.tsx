import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import GitHubIcon from '@mui/icons-material/GitHub';
import Box from '@mui/material/Box';
import Button from '@mui/material/Button';
import Chip from '@mui/material/Chip';
import Link from '@mui/material/Link';
import Paper from '@mui/material/Paper';
import Typography from '@mui/material/Typography';
import type { ReactNode } from 'react';
import museumShot from '../../../../../docs/images/museum-environment.png';
import parkingShot from '../../../../../docs/images/parking-availability.png';
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
      <Typography data-testid="home-intro" color="text.secondary" sx={{ mb: 1.5 }}>
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
  parking: <img src={parkingShot} alt="" />,
  museum: <img src={museumShot} alt="" />,
};

/** 一个场景的卡片：示意图、场景说明、业务视图和打开按钮；开发中的场景置灰 */
export function ScenarioCard(props: { scenario: Scenario }) {
  const t = useT();
  const { scenario } = props;
  const disabled = scenario.href === undefined;
  return (
    <Paper
      component="article"
      variant="outlined"
      className="scenario"
      data-scenario={scenario.id}
      data-disabled={disabled ? 'true' : undefined}
      aria-labelledby={`scenario-${scenario.id}`}
    >
      <div className="scenario-visual" data-visual={scenario.id}>
        {VISUALS[scenario.id]}
      </div>
      <div className="scenario-text">
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <Typography id={`scenario-${scenario.id}`} variant="h5" component="h3" sx={{ fontWeight: 700 }}>
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
      </div>
      <div className="scenario-action">
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
    </Paper>
  );
}

/** 页脚：虚构数据说明 */
export function Footer() {
  const t = useT();
  return (
    <Typography component="footer" color="text.secondary" sx={{ mt: 4, fontSize: 14 }}>
      {t('home.note')} <Link href={REPO}>GitHub</Link>
    </Typography>
  );
}

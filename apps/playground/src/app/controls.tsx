import Button from '@mui/material/Button';
import ToggleButton from '@mui/material/ToggleButton';
import ToggleButtonGroup from '@mui/material/ToggleButtonGroup';
import { i18n, useLocale, useT } from '../app-i18n';
import { appTheme, useThemeName } from '../app-theme';
import { LOCALE_NAMES, LOCALES } from '../i18n';

const selected = {
  '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'primary.main', color: '#fff' },
} as const;

/** 右下角常驻的主题切换和语言切换，跨页面保留 */
export function AppControls() {
  const t = useT();
  const locale = useLocale();
  const theme = useThemeName();
  return (
    <div className="app-controls">
      <Button
        className="theme-toggle"
        variant="outlined"
        size="small"
        color="inherit"
        aria-label={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
        title={t(theme === 'dark' ? 'theme.toLight' : 'theme.toDark')}
        onClick={() => appTheme.set(theme === 'dark' ? 'light' : 'dark')}
        sx={{ bgcolor: 'background.paper', borderColor: 'divider', color: 'text.primary', minWidth: 0 }}
      >
        {/* 文字是切换后的主题，读屏名称是完整的动作 */}
        {t(theme === 'dark' ? 'theme.light' : 'theme.dark')}
      </Button>
      <ToggleButtonGroup
        className="lang-switch"
        size="small"
        exclusive
        value={locale}
        aria-label={t('language.label')}
        onChange={(_, next) => next && i18n.setLocale(next)}
        sx={{ bgcolor: 'background.paper' }}
      >
        {LOCALES.map((l) => (
          <ToggleButton
            key={l}
            value={l}
            lang={l}
            sx={{ ...selected, color: 'text.primary', px: 1.25, py: 0.5, fontSize: 13 }}
          >
            {LOCALE_NAMES[l]}
          </ToggleButton>
        ))}
      </ToggleButtonGroup>
    </div>
  );
}

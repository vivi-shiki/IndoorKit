import {
  type Quality,
  RENDER_LEVELS,
  RENDER_PRESETS,
  type RenderLevel,
  type RenderOverrides,
} from '@indoorkit/core';
import type { TwinApi, TwinPerf } from '@indoorkit/core/twin';
import { useEffect, useState } from 'react';
import type { TWIN_MESSAGES } from './messages';
import type { QualityChoice } from './quality-store';

const SWITCHES = [
  ['shadows', 'settingShadows'],
  ['outline', 'settingOutline'],
  ['floors', 'settingFloors'],
  ['environment', 'settingEnvironment'],
  ['sky', 'settingSky'],
  ['antialias', 'settingAntialias'],
] as const;
type Switch = (typeof SWITCHES)[number][0];

/** 选择框的三种取值写回覆盖项；阴影打开时沿用档位的贴图尺寸，档位本来关着就用 1024 */
function override(
  overrides: RenderOverrides,
  key: Switch,
  value: string,
  level: RenderLevel,
): RenderOverrides {
  const next: RenderOverrides = { ...overrides };
  if (value === 'follow') delete next[key];
  else if (key === 'shadows') next.shadows = value === 'on' ? RENDER_PRESETS[level].shadows || 1024 : 0;
  else next[key] = value === 'on';
  return next;
}

/** 画质弹层：档位、单项覆盖和性能数字，和原项目的 L0–L4 分级一致 */
export function QualityPanel({
  t,
  api,
  choice,
  level,
  locale,
  onChoose,
}: {
  t: (typeof TWIN_MESSAGES)['en' | 'zh' | 'ja'];
  api: TwinApi | undefined;
  choice: QualityChoice;
  level: RenderLevel;
  locale: string;
  onChoose(choice: QualityChoice): void;
}) {
  const [perf, setPerf] = useState<TwinPerf>();
  useEffect(() => {
    if (!api) return;
    setPerf(api.perf());
    let last = 0;
    return api.onFrame(() => {
      const now = performance.now();
      if (now - last < 500) return;
      last = now;
      setPerf(api.perf());
    });
  }, [api]);
  return (
    <div className="twin-quality-panel" data-testid="twin-quality-panel" role="dialog" aria-label={t.quality}>
      <h2>{t.quality}</h2>
      <div className="chips twin-levels">
        {(['auto', ...RENDER_LEVELS] as Quality[]).map((q) => (
          <button
            type="button"
            key={q}
            className="chip"
            data-testid={`twin-level-${q}`}
            aria-pressed={choice.quality === q}
            onClick={() => onChoose({ quality: q, overrides: choice.overrides })}
          >
            {q === 'auto' ? `${t.auto} · ${level}` : t[`level${q}`]}
          </button>
        ))}
      </div>
      <h3>{t.advanced}</h3>
      <div className="twin-switches">
        {SWITCHES.map(([key, label]) => {
          const value = choice.overrides[key];
          return (
            <label key={key}>
              <span>{t[label]}</span>
              <select
                data-testid={`twin-setting-${key}`}
                disabled={!api}
                value={value === undefined ? 'follow' : value ? 'on' : 'off'}
                onChange={(e) =>
                  onChoose({
                    quality: choice.quality,
                    overrides: override(choice.overrides, key, e.target.value, level),
                  })
                }
              >
                <option value="follow">{t.follow}</option>
                <option value="on">{t.on}</option>
                <option value="off">{t.off}</option>
              </select>
            </label>
          );
        })}
      </div>
      <p className="muted" data-testid="twin-perf">
        {t.perf}: {perf ? perf.fps.toLocaleString(locale) : '0'} {t.fps} ·{' '}
        {(perf?.drawCalls ?? 0).toLocaleString(locale)} {t.drawCalls} ·{' '}
        {(perf?.triangles ?? 0).toLocaleString(locale)} {t.triangles}
      </p>
    </div>
  );
}

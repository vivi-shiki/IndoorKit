import { languageFallbacks } from '@indoorkit/core';
import { pickLabel } from '@indoorkit/imdf';
import { useLocale } from '../../../app-i18n';
import type { CrowdState } from '../../adapters/live';
import type { MuseumContext } from '../../adapters/venue';
import { useMuseumT } from '../../i18n';
import { useRoomName } from '../../map';
import { Swatch } from '../../presentation/swatch';

/** 一件藏品建议看几分钟 */
const VIEW_MINUTES = 2;

/** 路线经过的展示室和现在的混雑程度；提示路线上还没去的、最空的展示室 */
export function TourRooms(props: {
  ctx: MuseumContext;
  tour: string;
  crowd: ReadonlyMap<string, CrowdState>;
  current: string;
}) {
  const t = useMuseumT();
  const roomName = useRoomName(props.ctx);
  const { museum } = props.ctx;
  const stops = museum.route(props.tour).stops;
  const at = stops.findIndex((s) => s.unitId === props.current);
  const ahead = stops.slice(at + 1).filter((s) => props.crowd.get(s.unitId) === 'calm');
  return (
    <>
      <h2>{t('guide.rooms')}</h2>
      <ol className="rows" data-testid="tour-rooms">
        {stops.map((s) => {
          const state = props.crowd.get(s.unitId) ?? 'calm';
          return (
            <li
              key={s.unitId}
              className="row static"
              data-testid="tour-room"
              data-state={state}
              aria-current={s.unitId === props.current ? 'step' : undefined}
            >
              <span className="name">{roomName(s.unitId)}</span>
              <span className="count">{t(`crowd.${state}`)}</span>
            </li>
          );
        })}
      </ol>
      {ahead[0] && (
        <p className="note" data-testid="quiet-hint">
          {t('guide.quiet', { room: roomName(ahead[0].unitId) })}
        </p>
      )}
    </>
  );
}

/**
 * 走到展示柜前、收到信标后弹出的解说：这个展示柜里的藏品、示意图、作者、年代和材质，
 * 以及上一处、下一处按钮（演示用按钮代替走路）。
 */
export function NearbyCard(props: {
  ctx: MuseumContext;
  caseId: string;
  index: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
}) {
  const t = useMuseumT();
  const locale = useLocale();
  const roomName = useRoomName(props.ctx);
  const { museum } = props.ctx;
  const label = (map: Record<string, string>) => pickLabel(map, languageFallbacks(locale)) ?? '';
  const objects = museum.objectsAt(props.caseId);
  return (
    <aside className="drawer guide-card" data-testid="guide-card">
      <header>
        <h2>{t('guide.nearby', { room: roomName(props.caseId) })}</h2>
        <span className="muted" data-testid="guide-step">
          {t('guide.step', { n: props.index + 1, total: props.total })}
        </span>
      </header>
      <p className="muted">{t('guide.beacon')}</p>
      {objects.map((o) => (
        <section key={o.id} className="guide-object" data-testid="guide-object" data-code={o.code}>
          <Swatch material={o.material} code={o.code} label={t('object.swatch')} />
          <h3>{label(o.title)}</h3>
          <dl>
            <dt>{t('object.artist')}</dt>
            <dd>{label(o.artist)}</dd>
            <dt>{t('object.period')}</dt>
            <dd>{label(o.period)}</dd>
            <dt>{t('object.material')}</dt>
            <dd>{t(`material.${o.material}`)}</dd>
          </dl>
        </section>
      ))}
      <p className="muted">{t('guide.viewTime', { minutes: VIEW_MINUTES * objects.length })}</p>
      <div className="line">
        <button
          type="button"
          className="chip"
          data-testid="guide-prev"
          disabled={props.index === 0}
          onClick={props.onPrev}
        >
          {t('guide.prev')}
        </button>
        <button
          type="button"
          className="chip"
          data-testid="guide-next"
          disabled={props.index >= props.total - 1}
          onClick={props.onNext}
        >
          {t('guide.next')}
        </button>
      </div>
    </aside>
  );
}

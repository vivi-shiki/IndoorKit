import { checkMoves, OBJECT_STATUSES, SENSITIVITIES, suggestSwaps } from '@indoorkit/museum';
import { floorPlugin, routePlugin, unitStatePlugin } from '@indoorkit/plugins';
import { useEffect, useRef, useState } from 'react';
import { useMapEvent } from '../../../app/map';
import { parseClockParam } from '../../adapters/clock';
import { BUDGET_STATES, caseBudgetStates, type ObjectRow, objectRows } from '../../adapters/live';
import { useMuseumT } from '../../i18n';
import { codeOf, levelName, MuseumMapLayout, useMuseumMap, useTick } from '../../map';
import { BUDGET_COLORS } from '../../presentation/colors';
import { ChipGroup, ChoiceChips, Legend, Metric } from '../../presentation/ui';
import type { MuseumPageProps } from '../../routes';
import { MoveList, ObjectCard, ObjectList, SwapList } from './view';

const NONE: ReadonlySet<string> = new Set();
const TABS = ['objects', 'moves', 'swaps'] as const;
type Tab = (typeof TABS)[number];

/** 藏品与光照：每件藏品今年的累计光照量和公开天数、今天的换展与 RFID 核对、更换建议 */
export function CollectionPage({ query }: MuseumPageProps) {
  const t = useMuseumT();
  const stageRef = useRef<HTMLDivElement>(null);
  const [page, load] = useMuseumMap(stageRef, {
    page: 'collection',
    floor: '3F',
    startAt: query.has('t') ? parseClockParam(query.get('t')) : undefined,
    plugins: () =>
      [floorPlugin, unitStatePlugin({ colors: BUDGET_COLORS, order: BUDGET_STATES }), routePlugin()] as const,
  });
  const [rows, setRows] = useState<ObjectRow[] | null>(null);
  const [time, setTime] = useState(0);
  const [tab, setTab] = useState<Tab>('objects');
  const [sensitivities, setSensitivities] = useState(NONE);
  const [statuses, setStatuses] = useState<ReadonlySet<string>>(new Set(['display']));
  const [designatedOnly, setDesignatedOnly] = useState(NONE);
  const [objectId, setObjectId] = useState<string | null>(null);
  const [moveId, setMoveId] = useState<string | null>(null);

  useTick(page, 2000, (at) => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    const next = objectRows(ctx.day, at);
    const states = caseBudgetStates(ctx.museum, next);
    indoor.plugins['unit-state'].setStates(states);
    hooks.stateCounts = () =>
      Object.fromEntries(BUDGET_STATES.map((s) => [s, [...states.values()].filter((v) => v === s).length]));
    hooks.stateOf = (code) => {
      const id = [...states.keys()].find((u) => codeOf(ctx, u) === code);
      return id ? states.get(id)! : null;
    };
    if (!rows) void indoor.rendered().then(() => (hooks.ready = true));
    setRows(next);
    setTime(at);
  });

  useEffect(() => {
    if (!page) return;
    const { ctx, hooks, indoor } = page;
    hooks.highlighted = () => indoor.plugins['unit-state'].highlighted().map((id) => codeOf(ctx, id));
    hooks.markerCount = () => 0;
    hooks.routeLevels = () => indoor.plugins.route.levels().map((id) => levelName(page.floor, id));
    hooks.routeMeters = () => indoor.plugins.route.length();
  }, [page]);

  const selectObject = (id: string | null) => {
    setObjectId(id);
    if (!page) return;
    const where = id ? page.ctx.day.objectState(page.ctx.museum.object(id), time).location : null;
    page.indoor.plugins['unit-state'].highlight(where ? [where] : null);
    if (where) {
      const { museum } = page.ctx;
      const level = museum.isCase(where) ? museum.case(where).levelId : museum.room(where).levelId;
      page.floor.set(level);
    }
  };

  const selectMove = (id: string | null) => {
    setMoveId(id);
    if (!page) return;
    const { ctx, indoor, floor } = page;
    const move = ctx.day.moves.find((m) => m.id === id);
    if (!move) {
      indoor.plugins.route.clear();
      indoor.plugins['unit-state'].highlight(null);
      return;
    }
    const path = ctx.museum.walkPath(move.from, move.to);
    indoor.plugins.route.set(path.map((p) => ({ floor: p.levelId, coord: p.coord })));
    indoor.plugins['unit-state'].highlight([move.from, move.to]);
    floor.set(path[0]!.levelId);
  };

  useMapEvent(page, 'map:click', ({ coord }) => {
    const id = page!.indoor.plugins['unit-state'].unitAt(coord);
    if (!id || !page!.ctx.museum.isCase(id) || !rows) return;
    const inside = rows.find((r) => r.state.location === id);
    if (inside) {
      setTab('objects');
      selectObject(inside.object.id);
    }
  });

  const shown =
    rows?.filter(
      (r) =>
        (sensitivities.size === 0 || sensitivities.has(page!.ctx.museum.sensitivityOf(r.object))) &&
        (statuses.size === 0 || statuses.has(r.state.status)) &&
        (designatedOnly.size === 0 || r.object.designated),
    ) ?? [];
  const warn = rows?.filter((r) => r.state.status === 'display' && (r.share ?? 0) >= 0.8).length ?? 0;
  const moves = page ? checkMoves(page.ctx.museum, page.ctx.day.moves, page.ctx.day.rfidReads, time) : [];
  const swaps =
    page && rows ? suggestSwaps(page.ctx.museum, new Map(rows.map((r) => [r.object.id, r.lxh]))) : [];
  const selected = rows?.find((r) => r.object.id === objectId) ?? null;

  return (
    <MuseumMapLayout
      title="page.collection.title"
      desc="page.collection.desc"
      stageRef={stageRef}
      page={page}
      load={load}
      controls={
        <>
          <Metric
            label={t('collection.onDisplay')}
            testId="on-display"
            value={rows?.filter((r) => r.state.status === 'display').length ?? 0}
          />
          <Metric label={t('collection.nearBudget')} testId="near-budget" value={warn} />
          <Metric
            label={t('collection.movesToCheck')}
            testId="moves-to-check"
            value={moves.filter((m) => m.status === 'wrong-place' || m.status === 'overdue').length}
          />
          <ChoiceChips
            testId="tab-chip"
            label={t('control.view')}
            items={TABS.map((tb) => ({ value: tb, text: t(`tab.${tb}`) }))}
            selected={tab}
            onChange={(next) => {
              setTab(next);
              if (next !== 'moves') selectMove(null);
            }}
          />
        </>
      }
    >
      <aside className="panel collection-panel">
        <Legend items={BUDGET_STATES.map((s) => ({ color: BUDGET_COLORS[s], text: t(`budget.${s}`) }))} />
        {tab === 'objects' && (
          <>
            <ChipGroup
              testId="sensitivity-chip"
              label={t('sensitivity.label')}
              items={SENSITIVITIES.map((s) => ({ value: s, text: t(`sensitivity.${s}`) }))}
              selected={sensitivities}
              onChange={setSensitivities}
            />
            <ChipGroup
              testId="status-chip"
              label={t('object.status')}
              items={OBJECT_STATUSES.map((s) => ({ value: s, text: t(`status.${s}`) }))}
              selected={statuses}
              onChange={setStatuses}
            />
            <ChipGroup
              testId="designated-chip"
              label={t('designated.label')}
              items={[{ value: 'designated', text: t('designated.label') }]}
              selected={designatedOnly}
              onChange={setDesignatedOnly}
            />
            {page && <ObjectList ctx={page.ctx} rows={shown} selected={objectId} onSelect={selectObject} />}
          </>
        )}
        {tab === 'moves' && page && (
          <MoveList ctx={page.ctx} results={moves} selected={moveId} onSelect={selectMove} />
        )}
        {tab === 'swaps' && page && <SwapList ctx={page.ctx} swaps={swaps} onSelect={selectObject} />}
      </aside>
      {page && selected && (
        <ObjectCard ctx={page.ctx} row={selected} time={time} onClose={() => selectObject(null)} />
      )}
    </MuseumMapLayout>
  );
}

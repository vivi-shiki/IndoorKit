import { type TwinData, TwinPage } from '../../../app/twin';
import { museumRoomStatus } from '../../adapters/twin-status';
import { loadMuseum } from '../../adapters/venue';

async function load(): Promise<TwinData> {
  const ctx = await loadMuseum();
  return {
    venue: ctx.venue,
    operationsHref: '#/museum/environment',
    timeDependent: true,
    status: (time) => {
      ctx.alarms.update(time);
      return museumRoomStatus(ctx.alarms.all(), time);
    },
    legend: [
      { status: 'warn', label: 'legendAlarm' },
      { status: 'critical', label: 'legendSevere' },
    ],
    metrics: (time) => [
      {
        label: 'online',
        value: ctx.day.readings(time).filter((d) => d.online).length,
        total: ctx.museum.devices.length,
      },
      { label: 'cases', value: ctx.museum.cases.length },
      { label: 'objects', value: ctx.museum.objects.length },
    ],
  };
}
export function MuseumTwinPage() {
  return <TwinPage asset="museum" load={load} />;
}

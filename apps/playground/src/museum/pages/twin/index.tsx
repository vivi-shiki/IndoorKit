import { type TwinData, TwinPage } from '../../../app/twin';
import { loadMuseum } from '../../adapters/venue';

async function load(): Promise<TwinData> {
  const ctx = await loadMuseum();
  return {
    venue: ctx.venue,
    operationsHref: '#/museum/environment',
    timeDependent: true,
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

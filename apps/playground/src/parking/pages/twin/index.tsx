import { type TwinData, TwinPage } from '../../../app/twin';
import { liveAt, loadParking } from '../../adapters/venue';

async function load(): Promise<TwinData> {
  const ctx = await loadParking();
  return {
    venue: ctx.venue,
    operationsHref: '#/parking/availability',
    timeDependent: true,
    metrics: (time) => {
      const live = liveAt(ctx, time);
      return [
        {
          label: 'free',
          value: [...live.freeByLevel.values()].reduce((a, b) => a + b, 0),
          total: ctx.parking.bays.length,
        },
        { label: 'bays', value: ctx.parking.bays.length },
        {
          label: 'online',
          value:
            ctx.parking.devices.length -
            new Set(
              ctx.day
                .deviceReadings(time)
                .filter((d) => d.status === 'offline' || d.status === 'fault')
                .map((d) => d.deviceId),
            ).size,
          total: ctx.parking.devices.length,
        },
      ];
    },
  };
}
export function ParkingTwinPage() {
  return <TwinPage asset="parking" load={load} />;
}

import { hospitalIndoor } from '../../adapters/twin-indoor';
import { loadVenue, placesOf } from '../../adapters/venue';
import { type TwinData, TwinPage } from '../../app/twin';

async function load(): Promise<TwinData> {
  const venue = await loadVenue();
  const { hospital } = placesOf(venue);
  return {
    venue,
    indoor: hospitalIndoor(venue),
    timeDependent: true,
    operationsHref: '#/hospital/assets',
    metrics: () => [
      { label: 'departments', value: hospital.departments.length },
      {
        label: 'rooms',
        value: venue.features.units.features.filter((u) => u.properties.category === 'room').length,
      },
      { label: 'buildings', value: venue.buildings.length },
    ],
  };
}
export function HospitalTwinPage() {
  return <TwinPage asset="hospital" load={load} />;
}

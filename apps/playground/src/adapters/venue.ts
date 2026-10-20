import { createHospital, departmentExtension, type Hospital, type HospitalVenue } from '@indoorkit/hospital';
import { buildVenueModel, fetchImdf } from '@indoorkit/imdf';
import { createVenueIndex, type VenueIndex } from '@indoorkit/plugins';

let cached: Promise<HospitalVenue> | undefined;

/** 虚构医院数据由 tools/venue-gen 在构建时生成；科室在 IMDF 之外的 department.json 里 */
export function loadVenue(): Promise<HospitalVenue> {
  cached ??= fetchImdf(`${import.meta.env.BASE_URL}data/sakura-hospital`, fetch, [departmentExtension]).then(
    (archive) => buildVenueModel(archive, [departmentExtension]),
  );
  return cached;
}

const places = new WeakMap<HospitalVenue, { index: VenueIndex; hospital: Hospital }>();

/** 场馆的区块查询（SDK）和科室查询（医院业务），同一个场馆只建一次 */
export function placesOf(venue: HospitalVenue) {
  let found = places.get(venue);
  if (!found) {
    const index = createVenueIndex(venue);
    found = { index, hospital: createHospital(venue, index) };
    places.set(venue, found);
  }
  return found;
}

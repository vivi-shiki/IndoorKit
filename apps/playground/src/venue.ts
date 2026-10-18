import { buildVenueModel, fetchImdf, type VenueModel } from '@indoorkit/imdf';

let cached: Promise<VenueModel> | undefined;

/** 虚构医院数据由 tools/venue-gen 在构建时生成 */
export function loadVenue(): Promise<VenueModel> {
  cached ??= fetchImdf(`${import.meta.env.BASE_URL}data/sakura-hospital`).then(buildVenueModel);
  return cached;
}

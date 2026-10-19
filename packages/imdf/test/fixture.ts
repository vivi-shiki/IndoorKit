import type { ImdfArchive } from '../src/index';

/** 两层、两个区块、一扇门、一个科室的最小合法 IMDF 数据 */
export const IDS = {
  venue: '00000000-0000-4000-8000-000000000001',
  building: '00000000-0000-4000-8000-000000000002',
  level1: '00000000-0000-4000-8000-000000000003',
  level2: '00000000-0000-4000-8000-000000000004',
  room: '00000000-0000-4000-8000-000000000005',
  hall: '00000000-0000-4000-8000-000000000006',
  door: '00000000-0000-4000-8000-000000000007',
  wall: '00000000-0000-4000-8000-000000000008',
  department: '00000000-0000-4000-8000-000000000009',
};

const square = (x0: number, y0: number, x1: number, y1: number) => ({
  type: 'Polygon' as const,
  coordinates: [
    [
      [x0, y0],
      [x1, y0],
      [x1, y1],
      [x0, y1],
      [x0, y0],
    ],
  ],
});

export function makeArchive(): ImdfArchive {
  return {
    manifest: { version: '1.0.0', created: '2026-01-01T00:00:00Z', language: 'ja' },
    venue: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: IDS.venue,
          feature_type: 'venue',
          geometry: square(0, 0, 0.002, 0.001),
          properties: {
            category: 'healthcare',
            name: { ja: 'テスト病院', en: 'Test Hospital' },
            display_point: { type: 'Point', coordinates: [0.001, 0.0005] },
          },
        },
      ],
    },
    building: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: IDS.building,
          feature_type: 'building',
          geometry: null,
          properties: { category: 'unspecified', name: { ja: 'A棟', en: 'Building A' } },
        },
      ],
    },
    level: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: IDS.level2,
          feature_type: 'level',
          geometry: square(0, 0, 0.002, 0.001),
          properties: {
            category: 'unspecified',
            ordinal: 1,
            outdoor: false,
            name: { ja: '2階', en: 'Level 2' },
            short_name: { ja: '2F', en: '2F' },
            building_ids: [IDS.building],
          },
        },
        {
          type: 'Feature',
          id: IDS.level1,
          feature_type: 'level',
          geometry: square(0, 0, 0.002, 0.001),
          properties: {
            category: 'unspecified',
            ordinal: 0,
            outdoor: false,
            name: { ja: '1階', en: 'Level 1' },
            short_name: { ja: '1F', en: '1F' },
            building_ids: [IDS.building],
          },
        },
      ],
    },
    unit: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: IDS.room,
          feature_type: 'unit',
          geometry: square(0, 0, 0.001, 0.001),
          properties: {
            category: 'room',
            level_id: IDS.level1,
            name: { ja: '内科', en: 'Internal Medicine' },
          },
        },
        {
          type: 'Feature',
          id: IDS.hall,
          feature_type: 'unit',
          geometry: square(0.001, 0, 0.002, 0.001),
          properties: { category: 'walkway', level_id: IDS.level1, name: null },
        },
      ],
    },
    opening: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: IDS.door,
          feature_type: 'opening',
          geometry: {
            type: 'LineString',
            coordinates: [
              [0.001, 0.0004],
              [0.001, 0.0006],
            ],
          },
          properties: { category: 'pedestrian', level_id: IDS.level1 },
        },
      ],
    },
    fixture: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: IDS.wall,
          feature_type: 'fixture',
          geometry: square(0, 0.00099, 0.001, 0.001),
          properties: { category: 'wall', level_id: IDS.level1, name: null },
        },
      ],
    },
    amenity: { type: 'FeatureCollection', features: [] },
    department: {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          id: IDS.department,
          feature_type: 'department',
          geometry: null,
          properties: {
            code: 'internal',
            name: { ja: '内科', en: 'Internal Medicine' },
            unit_ids: [IDS.room],
          },
        },
      ],
    },
  };
}
